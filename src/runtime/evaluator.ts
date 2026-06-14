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
  HookDeclaration,
  BlockExpr,
  ObjectProperty,
  ObjectExpr,
  SwitchCase,
  DestructuringPattern,
} from "../parser/types.js";
import type { StateStore, StateValue } from "./state.js";
import { pathsOverlap } from "./state.js";
import type { HttpRuntime } from "./http.js";
import {
  createHttpResource,
  createMutationResource,
  createQueryResource,
  invalidateQueries,
  isEndpointResource,
} from "./http.js";
import type { EndpointResource } from "./http.js";
import { createSocketResource, createSseResource } from "./realtime.js";
import { createScriptResource, createDomManager, type DomManager } from "./interop.js";
import { createHeadManager, type HeadManager } from "./head.js";
import { createI18n, type I18nConfig } from "./i18n.js";
import { type ThemeNode } from "./builtins.js";
import { Util } from "./util.js";
import { Style, Rules } from "./namespaces-extra.js";
import { registerIcons } from "../icons/index.js";
import { loadFonts } from "../theme/fonts.js";
import { builtInThemes } from "../theme/index.js";
import { matchRoute, matchRoutePrefix, type Router, type NavigationGuard } from "./router.js";
import { findComponent } from "../library/registry.js";
import { findPositionalIndex, chooseNamedBagIndex, callArgShapes } from "../library/types.js";
import { UNIVERSAL_PROP_NAMES } from "../library/sx.js";
import type { ComponentLibrary } from "../library/types.js";
import { storage as storageGlobal } from "./storage.js";
import { consoleNs as consoleGlobal } from "./console.js";
import { createToastManager, type ToastManager } from "./toast.js";
import { createEnvManager, type EnvManager } from "./env.js";

/**
 * Built-in namespaces injected as top-level identifiers so authors can
 * reach for them without an explicit declaration. Each value is an
 * ordinary object — its public methods become `MethodCall` targets
 * (e.g. `storage.local.get("x")`, `console.warn("…")`).
 */
const GLOBAL_NAMESPACES: Record<string, unknown> = {
  // Curated fast-path for the most-used JS standard library globals, so
  // `Math.max(...)`, `JSON.stringify(x)`, `Object.keys(o)`, `new Date()`,
  // `new Map()`, `Number("5")`, etc. resolve without an import and without
  // touching the host realm. This is NOT the full set: every *other* JS
  // global (`window`, `document`, `URL`, `Blob`, `FormData`, `crypto`,
  // `Intl`, `BigInt`, `Reflect`, `fetch`, `alert`, `confirm`, `prompt`,
  // `atob`/`btoa`, `eval`, `Function`, …) resolves through the
  // `lookupHostGlobal` passthrough below — see that helper. Timers
  // (`setTimeout` / `setInterval` / `clear*`) ARE supported, but via
  // dedicated handlers in `evaluateComponentCall` (not here) so each handle
  // is tracked on the context and cleared on dispose rather than leaking
  // past a replan.
  Math,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Date,
  Map,
  Set,
  WeakMap,
  WeakSet,
  RegExp,
  Symbol,
  Promise,
  Error,
  TypeError,
  RangeError,
  Infinity,
  NaN,
  undefined,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  structuredClone: typeof structuredClone === "function" ? structuredClone : undefined,
};

/**
 * Aktion's own runtime **namespaces**, addressed with the `$` sigil that marks
 * every Aktion-provided global (state, hooks, builtins). A bare reference
 * (`$util`, `$console`, `$storage`) resolves to the namespace object; member
 * access (`$util.format(...)`, `$storage.local.get(...)`) then resolves on it.
 * These names are reserved — a `$util = …` declaration can't shadow them.
 *
 * The factory builtins (`$store`, `$router`, `$http`, `$theme`, `$i18n`,
 * `$emit`, `$effect`) are NOT here: they're only meaningful when *called*, so
 * they're dispatched at the call site (`evaluateInvoke` / the parser for
 * `$effect`). `$storage` is both — a namespace AND a `$storage({...})` factory.
 */
const RESERVED_STATE_NAMESPACES: Record<string, unknown> = {
  util: Util,
  console: consoleGlobal,
  storage: storageGlobal,
};

/**
 * Reserved namespace roots that are NOT plain constants — they resolve to a
 * per-context object (so the manager can call `notify()` and be torn down on
 * replan). `$toast` is the first such namespace. Listed here so the StateRef
 * resolver and `memberChainRootsAtState` treat them like the static reserved
 * namespaces (constant root, not fine-grained tracked state).
 */
const RESERVED_CONTEXT_NAMESPACES = new Set(["toast", "dom"]);

/** Lazily build (and cache on the context) the `$toast` manager singleton. */
function getToastManager(ctx: EvaluationContext): ToastManager {
  if (!ctx.toastManager) ctx.toastManager = createToastManager(ctx);
  return ctx.toastManager;
}

/**
 * Build a synthetic `ComponentNode` the author never wrote — used to inject
 * runtime-managed UI (currently the auto-rendered `$toast` layer). `props` is
 * an already-evaluated bag keyed by prop name; each value is dropped into its
 * declared slot, mirroring the positional contract `resolveLibraryCallArgs`
 * produces (so it survives prop reordering). Undefined values and trailing
 * empty slots are omitted. `key` becomes the stable per-instance identity.
 */
function makeRuntimeNode(
  ctx: EvaluationContext,
  name: string,
  props: Record<string, unknown>,
  key?: unknown,
): ComponentNode {
  const spec = ctx.library ? findComponent(ctx.library, name) : undefined;
  if (!spec) {
    return { __kind: "Component", name, args: [props], argMeta: [{}], explicitKey: key };
  }
  const slotByName = new Map<string, number>();
  spec.props.forEach((p, i) => {
    slotByName.set(p.name, i);
    if (p.aliases) for (const alias of p.aliases) if (!slotByName.has(alias)) slotByName.set(alias, i);
  });
  const args: unknown[] = spec.props.map(() => undefined);
  for (const [propName, value] of Object.entries(props)) {
    if (value === undefined) continue;
    const slot = slotByName.get(propName);
    if (slot !== undefined) args[slot] = value;
  }
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return { __kind: "Component", name, args, argMeta: args.map(() => ({})), explicitKey: key };
}

/**
 * Build the auto-rendered toast layer from the live `$toast` items — the same
 * shape an author would hand-write as `Toasts($toast.items.map(t => Toast(…)))`.
 * Returns null when there is nothing to show. A message-only toast renders the
 * message as the prominent title (no empty title row); a titled toast keeps the
 * message as the secondary line. Each toast is keyed by id so per-instance
 * state survives re-renders regardless of stack position.
 */
function buildToastLayer(ctx: EvaluationContext): ComponentNode | null {
  const mgr = ctx.toastManager;
  if (!mgr) return null;
  const items = mgr.items;
  if (items.length === 0) return null;
  const children = items.map((item) =>
    makeRuntimeNode(
      ctx,
      "Toast",
      {
        title: item.title != null ? item.title : item.message,
        message: item.title != null ? item.message : undefined,
        tone: item.tone,
        onClose: () => mgr.dismiss(item.id),
      },
      item.id,
    ),
  );
  return makeRuntimeNode(ctx, "Toasts", { children }, "$toast");
}

/**
 * Install the reserved `aktion` (UI root) binding, wrapping the author's root
 * thunk so live `$toast` notifications auto-render. Used for both the `$app(…)`
 * builtin and the legacy `aktion = …` assignment, so toasts appear without the
 * author wiring a `Toasts(...)` anywhere. If the program reads `$toast.items`
 * itself (the long-hand pattern), it owns rendering and we don't inject — so
 * existing programs never double-render.
 */
function installAppRootBinding(ctx: EvaluationContext, rootThunk: () => unknown): void {
  ctx.bindings.set("aktion", () => {
    ctx.toastItemsRead = false;
    const root = rootThunk();
    if (ctx.toastManager && !ctx.toastItemsRead) {
      const layer = buildToastLayer(ctx);
      if (layer) {
        if (Array.isArray(root)) return [...root, layer];
        return root == null ? layer : [root, layer];
      }
    }
    return root;
  });
}

/** Lazily build (and cache on the context) the `$dom` observer manager. */
function getDomManager(ctx: EvaluationContext): DomManager {
  if (!ctx.domManager) ctx.domManager = createDomManager(ctx);
  return ctx.domManager;
}

/** Lazily build (and cache on the context) the `$head` document-head manager. */
export function getHeadManager(ctx: EvaluationContext): HeadManager {
  if (!ctx.headManager) ctx.headManager = createHeadManager(ctx);
  return ctx.headManager;
}

/** Lazily build (and cache on the context) the reactive env-globals manager. */
function getEnvManager(ctx: EvaluationContext): EnvManager {
  if (!ctx.envManager) ctx.envManager = createEnvManager(ctx);
  return ctx.envManager;
}

/**
 * Per-context `$util` facade. Everything Aktion adds as a "global" lives here
 * rather than at the top level, so the bare `$`-name space stays small and
 * never collides with author state. It inherits every static `Util.*` helper
 * through its prototype, and adds:
 *
 *   - Reactive environment globals as getters: `$util.scroll`,
 *     `$util.viewport`, `$util.breakpoint`, `$util.media`, `$util.mouse`
 *     (each lazily activates its listener and re-renders on change).
 *   - The styling + validation helper namespaces: `$util.style`, `$util.rules`.
 *   - `$util.derived(fn)` — a reactive computed value (re-evaluates each render,
 *     tracking the atoms `fn` reads).
 *   - `$util.onError(fn)` — register a program-level error sink.
 *   - `$util.url` — a reactive snapshot of the current route path/params/query/hash.
 *
 * The `$util.$scroll` sigil form also works because the lexer strips the `$`,
 * so the property key is the same bare `scroll`.
 */
function getUtilFacade(ctx: EvaluationContext): Record<string, unknown> {
  if (ctx.utilFacade) return ctx.utilFacade;
  const facade = Object.create(Util as object) as Record<string, unknown>;
  const env = () => getEnvManager(ctx);
  Object.defineProperties(facade, {
    scroll: { get: () => env().scroll, enumerable: true },
    viewport: { get: () => env().viewport, enumerable: true },
    breakpoint: { get: () => env().breakpoint, enumerable: true },
    media: { get: () => env().media, enumerable: true },
    mouse: { get: () => env().mouse, enumerable: true },
    url: { get: () => readUrlSnapshot(ctx), enumerable: true },
    style: { value: Style, enumerable: true },
    rules: { value: Rules, enumerable: true },
    derived: {
      value: (fn: unknown): unknown => (typeof fn === "function" ? (fn as () => unknown)() : fn),
      enumerable: true,
    },
    onError: {
      value: (fn: unknown): void => {
        ctx.errorHook = typeof fn === "function"
          ? (info) => { (fn as (i: unknown) => void)(info); }
          : undefined;
      },
      enumerable: true,
    },
    onNavigate: {
      value: (fn: unknown): void => {
        // Register (or clear) a navigation guard on the host router. The guard
        // receives `{ to, from }` and may return `false` to block or a path
        // string to redirect; anything else allows the navigation.
        ctx.router?.setGuard(typeof fn === "function" ? (fn as NavigationGuard) : null);
      },
      enumerable: true,
    },
    onRequest: {
      value: (fn: unknown): void => {
        // Register an in-program request interceptor. `fn(request)` may mutate
        // and return the request, or return a partial that is merged over it
        // (headers shallow-merged) — ergonomic for auth-token injection.
        if (typeof fn !== "function") return;
        ctx.http?.registerProgramInterceptors({
          onRequest: (request) => {
            const out = (fn as (r: unknown) => unknown)(request);
            if (out && typeof out === "object") {
              const patch = out as Record<string, unknown>;
              return {
                ...request,
                ...patch,
                headers: { ...request.headers, ...((patch.headers as Record<string, string>) ?? {}) },
              };
            }
            return request;
          },
        });
      },
      enumerable: true,
    },
    onResponse: {
      value: (fn: unknown): void => {
        // Register an in-program response interceptor. `fn(response, retry)`
        // may return a replacement/patched response, or nothing to pass the
        // original through. `await retry()` re-issues the request once (e.g.
        // after refreshing an auth token on a 401).
        if (typeof fn !== "function") return;
        ctx.http?.registerProgramInterceptors({
          onResponse: async (response, retry) => {
            const out = await (fn as (r: unknown, retry: unknown) => unknown)(response, retry);
            return out && typeof out === "object" ? (out as typeof response) : response;
          },
        });
      },
      enumerable: true,
    },
    invalidate: {
      value: (keys: unknown): void => {
        // Refetch every cached `$query` whose key contains any given substring
        // (VI.2) — call after a manual write to pull fresh server state.
        invalidateQueries(ctx, keys);
      },
      enumerable: true,
    },
  });
  ctx.utilFacade = facade;
  return facade;
}

/**
 * Reactive snapshot of the current URL, surfaced as `$util.url`. Reading it
 * subscribes the render to route changes (via the shared `route` state slot,
 * which the host rewrites on every navigation). Exposes `path`, `params`
 * (route path params, e.g. `/users/:id`), `query` (parsed query object),
 * `hash` (fragment after `#`), and a `navigate(to)` callable.
 */
function readUrlSnapshot(ctx: EvaluationContext): Record<string, unknown> {
  // Subscribe to the route slot so the render re-runs on navigation — same
  // dependency the bare `route` identifier and `$route` namespace record.
  ctx.trackedState.add("route");
  const router = ctx.router;
  const path = readRoutePath(ctx);
  const params: Record<string, unknown> = router ? { ...router.getParams() } : {};
  const query: Record<string, string> = {};
  let hash = "";
  if (typeof globalThis !== "undefined" && (globalThis as { location?: Location }).location) {
    const loc = (globalThis as { location?: Location }).location as Location;
    // History router: `?a=b` lives in `location.search`, fragment in `location.hash`.
    // Hash router: the whole route (`#/path?a=b`) lives in `location.hash`.
    let search = loc.search ?? "";
    const rawHash = loc.hash ? loc.hash.replace(/^#/, "") : "";
    const qInHash = rawHash.indexOf("?");
    if (!search && qInHash >= 0) {
      search = rawHash.slice(qInHash);
    } else if (search) {
      hash = rawHash;
    }
    if (search) {
      const usp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      for (const [k, v] of usp) query[k] = v;
    }
  }
  return {
    path,
    params,
    query,
    hash,
    navigate: (to: unknown): void => {
      if (typeof to === "string" && to) router?.navigate(to);
    },
    setQuery: (nameOrObject: unknown, value?: unknown): void => {
      const next: Record<string, string> = { ...query };
      if (nameOrObject && typeof nameOrObject === "object" && !Array.isArray(nameOrObject)) {
        for (const [k, v] of Object.entries(nameOrObject as Record<string, unknown>)) {
          if (v == null || v === "") delete next[k];
          else next[k] = String(v);
        }
      } else if (typeof nameOrObject === "string") {
        if (value == null || value === "") delete next[nameOrObject];
        else next[nameOrObject] = String(value);
      }
      writeUrlQuery(ctx, next);
    },
    removeQuery: (name: unknown): void => {
      if (typeof name !== "string") return;
      const next: Record<string, string> = { ...query };
      delete next[name];
      writeUrlQuery(ctx, next);
    },
    toString() {
      return path;
    },
  };
}

/**
 * Write a query-parameter object back into `window.location`, preserving the
 * current route path, and trigger a re-render. In history mode the existing
 * `pathname` + fragment are kept and only the `?search` is swapped (so a
 * configured `basePath` survives); in hash mode the query rides after the
 * route inside the hash (`#/path?a=b`). Used by `$util.url.setQuery` /
 * `.removeQuery` (IV.6 — query-param ↔ state sync).
 */
function writeUrlQuery(ctx: EvaluationContext, params: Record<string, string>): void {
  if (typeof window === "undefined" || !window.location) return;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    usp.set(k, String(v));
  }
  const search = usp.toString();
  const mode = ctx.router?.getMode ? ctx.router.getMode() : "hash";
  if (mode === "history" && typeof window.history?.replaceState === "function") {
    const path = window.location.pathname || "/";
    const frag = window.location.hash || "";
    window.history.replaceState({}, "", path + (search ? `?${search}` : "") + frag);
  } else {
    const path = ctx.router ? ctx.router.getPath() : readRoutePath(ctx);
    window.location.hash = `#${path}${search ? `?${search}` : ""}`;
  }
  // The hash write may re-fire `hashchange`, but the router collapses it to the
  // same path (no notify), so re-render explicitly to reflect the new query.
  ctx.notify?.();
}

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
 * Security note: this is a deliberate full passthrough to the embedding
 * realm. The runtime already executes author-supplied code through this
 * evaluator, so surfacing capability-granting globals does not widen the
 * trust boundary beyond what the host page already grants the script.
 */
function lookupHostGlobal(name: string): { found: boolean; value: unknown } {
  if (typeof globalThis === "undefined") return { found: false, value: undefined };
  if (name in Object.prototype) return { found: false, value: undefined };
  const g = globalThis as Record<string, unknown>;
  if (name in g) return { found: true, value: g[name] };
  return { found: false, value: undefined };
}

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

/**
 * True when `name` refers to a user component declaration whose body is
 * currently being evaluated AND a library component of the same name exists.
 * In that window the name resolves to the built-in (wrapper semantics) —
 * see `EvaluationContext.activeComponentDecls`.
 */
function isSelfShadowingLibraryName(name: string, ctx: EvaluationContext): boolean {
  return ctx.activeComponentDecls.length > 0
    && ctx.activeComponentDecls.includes(name)
    && Boolean(ctx.library && findComponent(ctx.library, name));
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
  /**
   * Universal style/behaviour channel (suggestions-global Part I). Named
   * props (`sx`, `animate`, `id`, `anchor`, `className`, `style`, `aria`,
   * `data`, `tooltip`, `hidden`) that every component implicitly accepts.
   * They match no declared slot, so the evaluator collects them here and
   * the renderer applies them to the rendered element after `render(...)`.
   */
  universal?: Record<string, unknown>;
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

export const isStoreHandle = (value: unknown): value is StoreHandle => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { __kind?: unknown }).__kind === "Store",
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
export type HookCell =
  | { kind: "state"; value: unknown }
  | { kind: "memo"; deps: ReadonlyArray<unknown> | undefined; value: unknown }
  | { kind: "ref"; box: { current: unknown } }
  | { kind: "reducer"; value: unknown }
  | { kind: "id"; value: string };

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
  errorHook?: (info: { error: unknown; source: string }) => void;
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
  const ctx: EvaluationContext = {
    state,
    bindings: new Map(),
    expressions: new Map(),
    trackedState: new Set(),
    loopVars: new Map(),
    mutableBindings: new Map(),
    stateAliases: [],
    router: options.router,
    library: options.library,
    componentDecls: new Map(),
    activeComponentDecls: [],
    effectDecls: new Map(),
    componentEffectStack: [],
    actionDecls: new Map(),
    hookDecls: new Map(),
    hookScope: null,
    hookStore: new Map(),
    stores: new Map(),
    http: options.http,
    queryCache: new Map(),
    notify: options.notify,
    onEmit: options.onEmit,
    strict: options.strict,
    strictWarned: new Set(),
    disposers: [],
    timers: { timeouts: new Set(), intervals: new Set() },
    budget: options.budget === null ? undefined : (options.budget ?? createRuntimeBudget()),
  };
  // Cancel every outstanding timer when the context is torn down so a
  // `setInterval` / pending `setTimeout` from this program can't fire after
  // a replan or disconnect against a scope that no longer exists.
  ctx.disposers.push(() => {
    for (const id of ctx.timers.timeouts) clearTimeout(id);
    for (const id of ctx.timers.intervals) clearInterval(id);
    ctx.timers.timeouts.clear();
    ctx.timers.intervals.clear();
  });
  // Wipe any in-program HTTP interceptors (`$util.onRequest`/`onResponse`)
  // registered by the previous program — the runtime is shared across
  // replans, so program interceptors must not leak into the next program.
  options.http?.clearProgramInterceptors();
  ctx.disposers.push(() => options.http?.clearProgramInterceptors());
  return ctx;
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
 * Clear the per-render mutable-binding cache. Called by the host at the
 * start of every render pass so top-level `let`/`var`/plain bindings are
 * re-seeded from their initialisers each render (keeping derived values
 * reactive) while remaining stable WITHIN a single render (so `.push`
 * and `[...x, y]` mutations behave like ordinary JS module variables).
 */
export function resetMutableBindings(ctx: EvaluationContext): void {
  ctx.mutableBindings.clear();
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
    if (extracted) {
      return extracted.path.length === 0
        ? extracted.name
        : `${extracted.name}.${extracted.path.join(".")}`;
    }
    // Two-way binding to a store field — `Input(value: cart.draft)`. The
    // backing-atom name has no dots, so the renderer's `writeState` splits it
    // back into root + path and routes the write through `setPath`.
    const storePath = extractStorePath(expr, ctx);
    if (storePath) {
      return storePath.path.length === 0
        ? storePath.atom
        : `${storePath.atom}.${storePath.path.join(".")}`;
    }
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

  // 1.55 pass: state declarations whose RHS is a `Http({...})` call need
  // their resource bag created eagerly so the request fires at program
  // mount. We run this *after* bindings are installed so the request
  // config can reference forward-declared plain bindings, components, and
  // state (e.g. `base = "https://api…"` then `$todos = Http({ url: base + "/todos" })`).
  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment" || !stmt.isState) continue;
    if (!isHttpResourceCall(stmt.expression)) continue;
    const value = evaluate(stmt.expression, ctx);
    ctx.state.set(stmt.identifier, value);
  }

  // 1.6 pass: run any top-level *imperative* statements once per plan —
  // `while`, `for`, `if`, `try`, bare expression statements, etc. These
  // are not value-producing bindings (those are handled above) but
  // procedural setup the author wrote at the top level, e.g. building a
  // `$state` array with a loop. Running them here (after declarations
  // and bindings are installed, before computed derivations subscribe)
  // makes patterns like `while (i > 0) { $items = [...$items, …] }` work.
  runTopLevelImperativeStatements(program, ctx);

  // 1.75 pass: computed `$state = expr` atoms whose RHS is *not* a pure
  // literal. The literal pass above seeded these slots with `null`
  // because `evaluateLiteral` is intentionally conservative; without
  // this follow-up pass the user-visible value would stay `null` for
  // every program that uses derived state (`$total = Util.sum($cart.price)`,
  // `$subtotal = Util.sum($lines)`, `$shipping = if … else …`, …) — exactly
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
          // Recompute only when a changed path overlaps one of this
          // derivation's tracked paths — `$total = $cart.total` recomputes
          // on a `cart.total` (or whole-`cart`) write, but not on a
          // `cart.shipping` write. `anyPathAffects` applies the prefix rule.
          const needs = pathsOverlap(propagated, entry.deps);
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
        (prop) => !prop.spread && !prop.computedKey && isPureLiteralExpression(prop.value),
      );
    case "Template":
      return expr.expressions.length === 0;
    default:
      return false;
  }
}

/** `true` for `$http({...})` resource declarations (handled in the 1.55 pass). */
function isHttpResourceCall(expr: Expression): boolean {
  return (
    expr.kind === "Invoke" &&
    expr.callee.kind === "StateRef" &&
    expr.callee.name === "http"
  );
}

/**
 * `true` for a `$theme({...})` call — a runtime factory Invoke on the
 * `theme` StateRef. A bare `$theme({...})` statement (no `theme =`
 * binding) is treated as the reserved `theme` binding so the element can
 * layer its tokens onto the host without an explicit assignment.
 */
function isThemeCall(expr: Expression): boolean {
  return (
    expr.kind === "Invoke" &&
    expr.callee.kind === "StateRef" &&
    expr.callee.name === "theme"
  );
}

/**
 * `true` for a `$app(...)` call — the runtime root builtin. A bare
 * `$app(node)` / `$app([nodes])` / `$app(node, …)` statement registers the
 * reserved root binding the element renders, replacing the legacy
 * `aktion = …` root assignment.
 */
function isAppCall(expr: Expression): boolean {
  return (
    expr.kind === "Invoke" &&
    expr.callee.kind === "StateRef" &&
    expr.callee.name === "app"
  );
}

function installStatementBinding(stmt: Statement, ctx: EvaluationContext): void {
  switch (stmt.kind) {
    case "ComponentDeclaration": {
      // A PascalCase `function Name(...)` declaration is registered as
      // BOTH a component (so `Name()` in render position produces a
      // node) AND an action (so `onClick: Name` resolves to a callable
      // that runs the body for its side effects). This lets a PascalCase
      // declaration be used in either position regardless of whether it
      // returns a value — a component with no `return` simply renders
      // nothing.
      ctx.componentDecls.set(stmt.name, stmt);
      ctx.actionDecls.set(stmt.name, {
        kind: "ActionDeclaration",
        name: stmt.name,
        params: stmt.params,
        body: stmt.body,
        loc: stmt.loc,
      });
      return;
    }
    case "EffectDeclaration":
      ctx.effectDecls.set(stmt.name, stmt);
      return;
    case "ActionDeclaration":
      ctx.actionDecls.set(stmt.name, stmt);
      return;
    case "HookDeclaration":
      ctx.hookDecls.set(stmt.name, stmt);
      return;
    case "Await":
    case "Return":
      return;
    case "Import":
      // Module syntax is resolved + merged by the in-browser linker
      // (`linkProject` / `linkProgram`) before the program reaches the runtime.
      // The streaming single-file runtime has no module map, so a stray
      // `import` in a streamed program is intentionally a no-op. The `exported`
      // flag on declarations is likewise transparent (nothing reads it here).
      return;
    case "ExpressionStatement": {
      // Bare runtime-root / theme statements register the reserved binding
      // the element reads, so authors don't assign them to a name:
      //   `$app(...)`    → the UI root      (replaces `aktion = …`)
      //   `$theme({...})` → in-script theme override
      // The legacy `aktion = …` / `theme = $theme({...})` assignment forms
      // keep working via the Assignment case below; whichever appears last
      // in source wins.
      const inner = stmt.expression;
      if (isAppCall(inner)) {
        installAppRootBinding(ctx, () => evaluate(inner, ctx));
      } else if (isThemeCall(inner)) {
        ctx.bindings.set("theme", () => evaluate(inner, ctx));
      }
      return;
    }
    case "Assignment": {
      if (stmt.isState) return;
      ctx.expressions.set(stmt.identifier, stmt.expression);
      const expr = stmt.expression;
      // The legacy `aktion = …` UI-root form gets the same auto-toast wrapper
      // as `$app(…)`; everything else is a plain value binding.
      if (stmt.identifier === "aktion") {
        installAppRootBinding(ctx, () => evaluate(expr, ctx));
      } else {
        ctx.bindings.set(stmt.identifier, () => evaluate(expr, ctx));
      }
      return;
    }
  }
}

/**
 * `true` for top-level statements that are *imperative* (run for their
 * side effects) rather than declarations or value-producing bindings.
 * These are executed once per plan by `runTopLevelImperativeStatements`.
 */
function isTopLevelImperativeStatement(stmt: Statement): boolean {
  switch (stmt.kind) {
    case "IfStatement":
    case "SwitchStatement":
    case "ForOfStatement":
    case "ForClassicStatement":
    case "ForInStatement":
    case "WhileStatement":
    case "DoWhileStatement":
    case "TryStatement":
    case "DestructureStatement":
    case "ThrowStatement":
      return true;
    case "ExpressionStatement":
      // Bare `$app(...)` / `$theme({...})` statements are reserved-binding
      // registrations (handled in installStatementBinding), not imperative
      // side effects — exclude them so they don't force the per-plan
      // pure-literal `$state` reset that genuine top-level control flow does.
      return !isAppCall(stmt.expression) && !isThemeCall(stmt.expression);
    default:
      return false;
  }
}

/**
 * Execute the program's top-level imperative statements once per plan,
 * in source order. Skips declarations / bindings (`$state`, `let`,
 * `function`, `effect`, …) — only control-flow and bare expression
 * statements run here.
 *
 * For idempotency across re-plans (the program text changes on every
 * streamed chunk, and `StateStore.declare` preserves existing values so
 * user edits survive), pure-literal top-level `$state` declarations are
 * reset to their literal value first — so a loop that *builds* state
 * (`while (i--) $items = [...$items, …]`) rebuilds from a clean slate
 * each plan instead of stacking onto the previous run. This reset only
 * happens when the program actually contains top-level imperative
 * statements, so ordinary reactive programs keep their persisted state.
 */
function runTopLevelImperativeStatements(program: Program, ctx: EvaluationContext): void {
  let hasImperative = false;
  for (const stmt of program.statements) {
    if (isTopLevelImperativeStatement(stmt)) { hasImperative = true; break; }
  }
  if (!hasImperative) return;

  for (const stmt of program.statements) {
    if (stmt.kind === "Assignment" && stmt.isState && isPureLiteralExpression(stmt.expression)) {
      ctx.state.set(stmt.identifier, evaluateLiteral(stmt.expression) as never);
    }
  }

  for (const stmt of program.statements) {
    if (!isTopLevelImperativeStatement(stmt)) continue;
    try {
      runControlFlowStatement(stmt, ctx);
    } catch (err) {
      // Stray loop/return signals at the top level are harmless — ignore.
      if (err instanceof BreakSignal || err instanceof ContinueSignal || err instanceof ReturnSignal) {
        continue;
      }
      // Runtime-budget aborts must propagate so the host can surface them.
      if (err instanceof RuntimeBudgetError) throw err;
      // A user `throw` (or any other error) shouldn't tear down planning.
      // eslint-disable-next-line no-console
      console.error("[aktion] top-level statement threw", err);
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
      `[aktion] $router expects an object literal of route arms (e.g. \`$router({ "/": Home(), default: NotFound() })\`).`,
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
    // Nested / layout route (IV.1): an arm whose value is an object literal
    // with a `layout` key matches as a PREFIX and resolves a child route from
    // its `routes` map, binding the child node as the `outlet` identifier.
    const layoutArm = asLayoutArm(prop.value);
    if (layoutArm) {
      const pm = matchRoutePrefix(pattern, path);
      if (!pm.matched) continue;
      return runLayoutArm(pattern, layoutArm, pm.params, pm.rest, ctx);
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

/**
 * Detect a layout-route arm: an object literal with a `layout` property (and
 * optionally a `routes` map). Returns the two sub-expressions, or null when the
 * value is an ordinary route node.
 */
function asLayoutArm(value: Expression): { layout: Expression; routes: ObjectExpr | null } | null {
  if (value.kind !== "Object") return null;
  let layout: Expression | null = null;
  let routes: ObjectExpr | null = null;
  for (const prop of value.properties) {
    if (prop.spread) continue;
    if (prop.key === "layout") layout = prop.value;
    else if (prop.key === "routes" && prop.value.kind === "Object") routes = prop.value;
  }
  return layout ? { layout, routes } : null;
}

/**
 * Render a layout route: resolve the child route from `routes` against the
 * remaining path `rest`, bind it as the `outlet` identifier (+ `params`), then
 * evaluate the `layout` expression so `AppShell(Sidebar(), outlet)` slots the
 * child in. Nested layouts compose because the child resolution recurses
 * through the same matching.
 */
function runLayoutArm(
  pattern: string,
  arm: { layout: Expression; routes: ObjectExpr | null },
  params: Record<string, string>,
  rest: string,
  ctx: EvaluationContext,
): unknown {
  // Resolve the child node from the nested `routes` map against `rest`.
  let child: unknown = null;
  let childPattern: string | null = null;
  let childParams: Record<string, string> = {};
  if (arm.routes) {
    let childWildcard: ObjectProperty | null = null;
    for (const prop of arm.routes.properties) {
      if (prop.spread) continue;
      if (prop.key === "default" || prop.key === "*") { childWildcard = prop; continue; }
      const nested = asLayoutArm(prop.value);
      if (nested) {
        const pm = matchRoutePrefix(prop.key, rest);
        if (!pm.matched) continue;
        childPattern = prop.key;
        childParams = pm.params;
        child = runLayoutArm(prop.key, nested, pm.params, pm.rest, ctx);
        break;
      }
      const m = matchRoute(prop.key, rest);
      if (!m.matched) continue;
      childPattern = prop.key;
      childParams = m.params;
      child = evaluateWithBindings(prop.value, ctx, { params: m.params });
      break;
    }
    if (child === null && childPattern === null && childWildcard) {
      child = evaluateWithBindings(childWildcard.value, ctx, { params: {} });
    }
  }
  // The combined params (parent prefix + child) are exposed to the layout.
  const merged = { ...params, ...childParams };
  ctx.router?.setActiveMatch(childPattern ? `${pattern}${childPattern}` : pattern, merged);
  return evaluateWithBindings(arm.layout, ctx, { params: merged, outlet: child });
}

/** Evaluate `expr` with extra loop-var bindings restored afterward. */
function evaluateWithBindings(
  expr: Expression,
  ctx: EvaluationContext,
  bindings: Record<string, unknown>,
): unknown {
  const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
  for (const [name, value] of Object.entries(bindings)) {
    restore.push({ name, had: ctx.loopVars.has(name), prev: ctx.loopVars.get(name) });
    ctx.loopVars.set(name, value);
  }
  try {
    return evaluate(expr, ctx);
  } finally {
    for (const r of restore) {
      if (r.had) ctx.loopVars.set(r.name, r.prev);
      else ctx.loopVars.delete(r.name);
    }
  }
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
      // Per-render mutable slot already seeded (by a prior read or an
      // imperative write this render) — return the live value/reference
      // so `.push` mutations and `x = [...x, y]` reassignments persist
      // within the render.
      if (ctx.mutableBindings.has(expr.name)) return ctx.mutableBindings.get(expr.name);
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
      if (binding) {
        // Seed the per-render mutable slot from the declared initialiser
        // on first access, then hand back the SAME value for the rest of
        // the render. Functions/lambdas and pure derivations are equally
        // happy with this (one stable instance per render); mutable
        // containers (`let items = []`) now keep their identity so
        // imperative mutations stick.
        const value = binding();
        ctx.mutableBindings.set(expr.name, value);
        return value;
      }
      // A bare `myAction` reference (e.g. `Button("Save", save)`,
      // `fruits.map(myAction)`, `$result = myAction("Ada")`) resolves to
      // a synchronous callable that runs the action body inline and
      // returns the body's value. State writes inside the body fire
      // their reactive subscribers — which schedule a re-render — so we
      // never need to call `notify()` per call (the previous async
      // wrapper *did* notify per call, which produced an infinite render
      // loop when an action was passed as a `.map(...)` callback).
      // Inside the body of a component declaration that shadows a library
      // component, bare references to that name skip the user declaration
      // (and its action mirror) and resolve to the built-in below — same
      // wrapper semantics as the call path.
      const refShadowsBuiltin = isSelfShadowingLibraryName(expr.name, ctx);
      const action = refShadowsBuiltin ? undefined : ctx.actionDecls.get(expr.name);
      if (action) return makeSyncActionCallable(action, ctx);
      // PascalCase function declarations (components) referenced by name
      // resolve to a synchronous callable that builds a `UserComponent`
      // node. This is what makes `fruits.map(Fruit)` produce a list of
      // rendered components — JS callers (including `Array.prototype.map`)
      // invoke the returned function with the standard `(item, index)`
      // signature, and the callable forwards them as positional args to
      // the component declaration.
      const userComponent = refShadowsBuiltin ? undefined : ctx.componentDecls.get(expr.name);
      if (userComponent) return makeUserComponentCallable(userComponent, ctx);
      // Built-in namespace globals (`storage`, `console`). Returned as
      // ordinary objects so member/method-call expressions resolve
      // against them directly via the standard `memberAccess` path.
      if (Object.prototype.hasOwnProperty.call(GLOBAL_NAMESPACES, expr.name)) {
        return GLOBAL_NAMESPACES[expr.name];
      }
      // Library component referenced by name (e.g. `fruits.map(Badge)`).
      // Returns a synchronous callable that produces a `ComponentNode`
      // when invoked, so library components compose with array helpers
      // the same way user component declarations do.
      if (ctx.library && findComponent(ctx.library, expr.name)) {
        return makeLibraryComponentCallable(expr.name, ctx);
      }
      // `cleanup` resolves to a real bound function while an effect body is
      // running, so it survives aliasing / nested blocks rather than being
      // recognised only by literal callee name (feedback §2.5).
      if (expr.name === "cleanup" && ctx.cleanupSink) {
        const sink = ctx.cleanupSink;
        return (fn: unknown): void => {
          if (typeof fn === "function") sink(fn as () => void);
        };
      }
      // Full JavaScript global surface — any host global (`window`,
      // `document`, `URL`, `crypto`, `navigator`, `Intl`, `alert`, `fetch`,
      // …) not shadowed by an author declaration or library component above.
      // This also powers `new URL(...)`, `crypto.randomUUID()`, and bare
      // references like `onClick: alert`, because `New` / `MethodCall`
      // resolve their callee / object through this identifier path.
      const hostGlobal = lookupHostGlobal(expr.name);
      if (hostGlobal.found) return hostGlobal.value;
      // Unknown identifier — render as null so the parser is forgiving.
      // In strict mode, surface it as a one-per-name warning so silent
      // typos (e.g. `couunt` for `count`) are not swallowed.
      if (ctx.strict && !ctx.strictWarned.has(expr.name)) {
        ctx.strictWarned.add(expr.name);
        const where = expr.loc ? ` (line ${expr.loc.line}, col ${expr.loc.column})` : "";
        // eslint-disable-next-line no-console
        console.warn(
          `[aktion] strict: unknown identifier "${expr.name}" resolved to null${where}. ` +
            `Did you misspell a state atom, action, or component name?`,
        );
      }
      return null;
    }
    case "StateRef": {
      // Reserved Aktion namespaces (`$util`, `$console`, `$storage`) resolve
      // to their namespace object — they are constants, not tracked state.
      if (Object.prototype.hasOwnProperty.call(RESERVED_STATE_NAMESPACES, expr.name)) {
        // `$util` resolves to a per-context facade so `$util.scroll` /
        // `$util.viewport` / … reach the reactive env globals in addition to
        // the static `$util.*` helpers.
        if (expr.name === "util") return getUtilFacade(ctx);
        return RESERVED_STATE_NAMESPACES[expr.name];
      }
      // Per-context reserved namespaces (`$toast`) resolve to a lazily-built
      // singleton rather than a static constant.
      if (RESERVED_CONTEXT_NAMESPACES.has(expr.name)) {
        if (expr.name === "toast") return getToastManager(ctx);
        if (expr.name === "dom") return getDomManager(ctx);
      }
      // `$emit` read resolves to a real bound dispatcher so it survives
      // aliasing (`const e = $emit; e("name", detail)`) instead of being
      // recognised only as a literal `$emit(...)` callee (feedback §2.5).
      // Direct `$emit(...)` calls still take the dedicated dispatch path.
      if (expr.name === "emit" && ctx.onEmit) {
        const onEmit = ctx.onEmit;
        return (eventName: unknown, detail?: unknown): void => {
          onEmit(eventName == null ? "" : String(eventName), detail);
        };
      }
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
        const key = prop.computedKey
          ? String(evaluate(prop.computedKey, ctx) ?? "")
          : prop.key;
        obj[key] = evaluate(prop.value, ctx);
      }
      return obj;
    }
    case "Member": {
      // Fine-grained reactivity: a member chain rooted at a `$atom`
      // subscribes to the *precise path* it reads (`$user.name` → `user.name`)
      // rather than the whole atom. Non-state-rooted chains (loop vars,
      // `route.params`, function results, …) keep the plain behaviour.
      if (memberChainRootsAtState(expr)) {
        return evaluateStateMember(expr, ctx);
      }
      // A chain rooted at a `Store` handle reads the store's state atom with
      // the same fine-grained tracking (`cart.items` → `<atom>.items`).
      const storeHandle = storeChainRootHandle(expr, ctx);
      if (storeHandle) {
        return evaluateStoreMember(expr, ctx, storeHandle);
      }
      const target = evaluate(expr.object, ctx);
      if (expr.optional && target == null) return undefined;
      if (expr.computed) {
        const key = evaluate(expr.computed, ctx);
        return computedMemberAccess(target, key);
      }
      return memberAccess(target, expr.property ?? "");
    }
    case "Unary": {
      // `delete` is short-circuit: we never evaluate the operand as a
      // value (mirrors JS `delete obj.prop` which removes the binding).
      if (expr.operator === "delete") {
        const target = expr.argument;
        if (target.kind === "Member" && target.property) {
          const object = evaluate(target.object, ctx);
          if (object && typeof object === "object") {
            try { delete (object as Record<string, unknown>)[target.property]; return true; }
            catch { return false; }
          }
        }
        return false;
      }
      const value = evaluate(expr.argument, ctx);
      switch (expr.operator) {
        case "!": return !value;
        case "-": return -toNumber(value);
        case "+": return +toNumber(value);
        case "~": return ~toInt32(value);
        case "typeof": return typeof value;
        case "void": return undefined;
        default: return value;
      }
    }
    case "Binary": return evaluateBinary(expr.operator, expr.left, expr.right, ctx);
    case "Ternary": {
      const test = evaluate(expr.test, ctx);
      return test ? evaluate(expr.consequent, ctx) : evaluate(expr.alternate, ctx);
    }
    case "Call": return evaluateComponentCall(expr.callee, expr.arguments, ctx, expr.loc);
    case "MethodCall": return evaluateMethodCall(expr, ctx);
    case "Invoke": return evaluateInvoke(expr, ctx);
    case "New": return evaluateNew(expr, ctx);
    case "BuiltinCall": return evaluateBuiltinCall(expr.name, expr.arguments, ctx);
    case "Template": return evaluateTemplate(expr.quasis, expr.expressions, ctx);
    case "Spread": {
      // A bare spread outside of an array/object literal collapses to its
      // argument value. The array/object evaluators handle the spread
      // semantics, so we only reach here for malformed input.
      return evaluate(expr.argument, ctx);
    }
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
        const bindLocal = (name: string, value: unknown) => {
          restore.push({
            name,
            had: ctx.loopVars.has(name),
            prev: ctx.loopVars.get(name),
          });
          ctx.loopVars.set(name, value);
        };
        for (let i = 0; i < lambdaParams.length; i += 1) {
          const param = lambdaParams[i]!;
          let value: unknown = callArgs[i];
          if (value === undefined && param.defaultValue) {
            value = evaluate(param.defaultValue, ctx);
          }
          if (param.pattern) {
            for (const pair of resolvePatternBindings(param.pattern, value, ctx)) {
              bindLocal(pair.name, pair.value);
            }
            continue;
          }
          bindLocal(param.name, value);
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

/**
 * Control-flow signals threaded through `runStatement` / `evaluateBlock`
 * so `break`, `continue`, and `return` in nested `for` / `while` /
 * `if` bodies propagate up to the enclosing loop / function body.
 *
 * Thrown as a class so the existing try/finally restores still execute
 * along the way; the loop / function runners catch the matching
 * signal and either resume or exit.
 */
export class BreakSignal { readonly kind = "break" as const; }
export class ContinueSignal { readonly kind = "continue" as const; }
export class ReturnSignal {
  readonly kind = "return" as const;
  constructor(public readonly value: unknown) {}
}

/**
 * Run an `if (cond) { … } else { … }` STATEMENT. The body is executed
 * for side effects; the statement itself produces no value (mirrors
 * JS — use the ternary operator when you need a value).
 */
function runIfStatement(
  stmt: { test: Expression; consequent: BlockExpr; alternate?: Statement | BlockExpr },
  ctx: EvaluationContext,
): void {
  if (evaluate(stmt.test, ctx)) {
    runBlockStatements(stmt.consequent.body, ctx);
    return;
  }
  if (stmt.alternate) {
    if ((stmt.alternate as { kind?: string }).kind === "IfStatement") {
      runIfStatement(stmt.alternate as { test: Expression; consequent: BlockExpr; alternate?: Statement | BlockExpr }, ctx);
      return;
    }
    if ((stmt.alternate as { kind?: string }).kind === "Block") {
      runBlockStatements((stmt.alternate as BlockExpr).body, ctx);
    }
  }
}

/** Run a `switch (val) { case X: …; break; default: … }` STATEMENT. */
function runSwitchStatement(
  stmt: { discriminant: Expression; cases: ReadonlyArray<SwitchCase> },
  ctx: EvaluationContext,
): void {
  const value = evaluate(stmt.discriminant, ctx);
  let matched = false;
  try {
    for (const c of stmt.cases) {
      if (!matched) {
        if (c.test === null) {
          matched = true;
        } else if (evaluate(c.test, ctx) === value) {
          matched = true;
        }
      }
      if (matched) {
        runBlockStatements(c.body, ctx);
      }
    }
  } catch (err) {
    if (err instanceof BreakSignal) return;
    throw err;
  }
}

/** Run a `for (let x of arr) { … }` STATEMENT. */
function runForOfStatement(
  stmt: {
    item: string;
    index?: string;
    destructure?: ReadonlyArray<string>;
    iterable: Expression;
    body: BlockExpr;
  },
  ctx: EvaluationContext,
): void {
  const iterableValue = evaluate(stmt.iterable, ctx);
  if (!Array.isArray(iterableValue) && (iterableValue == null || typeof iterableValue !== "object" || !(Symbol.iterator in (iterableValue as object)))) {
    return;
  }
  const itemHad = ctx.loopVars.has(stmt.item);
  const itemPrev = ctx.loopVars.get(stmt.item);
  const idxName = stmt.index;
  const idxHad = idxName ? ctx.loopVars.has(idxName) : false;
  const idxPrev = idxName ? ctx.loopVars.get(idxName) : undefined;
  const destructure = stmt.destructure ?? [];
  const destructurePrev: Array<{ name: string; had: boolean; value: unknown }> =
    destructure.map((name) => ({
      name,
      had: ctx.loopVars.has(name),
      value: ctx.loopVars.get(name),
    }));
  try {
    let i = 0;
    const iter = Array.isArray(iterableValue)
      ? iterableValue
      : (iterableValue as Iterable<unknown>);
    for (const row of iter) {
      tickIterations(ctx.budget, 1, "`for…of` loop");
      ctx.loopVars.set(stmt.item, row);
      if (idxName) ctx.loopVars.set(idxName, i);
      for (const field of destructure) {
        const value = row && typeof row === "object"
          ? (row as Record<string, unknown>)[field]
          : undefined;
        ctx.loopVars.set(field, value);
      }
      try {
        runBlockStatements(stmt.body.body, ctx);
      } catch (err) {
        if (err instanceof ContinueSignal) { i += 1; continue; }
        if (err instanceof BreakSignal) return;
        throw err;
      }
      i += 1;
    }
  } finally {
    if (itemHad) ctx.loopVars.set(stmt.item, itemPrev);
    else ctx.loopVars.delete(stmt.item);
    if (idxName) {
      if (idxHad) ctx.loopVars.set(idxName, idxPrev);
      else ctx.loopVars.delete(idxName);
    }
    for (const entry of destructurePrev) {
      if (entry.had) ctx.loopVars.set(entry.name, entry.value);
      else ctx.loopVars.delete(entry.name);
    }
  }
}

/** Run a classic `for (init; test; update) { … }` STATEMENT. */
function runForClassicStatement(
  stmt: { init?: Statement; test?: Expression; update?: Expression; body: BlockExpr },
  ctx: EvaluationContext,
): void {
  if (stmt.init) runStatementInBlock(stmt.init, ctx);
  while (true) {
    if (stmt.test && !evaluate(stmt.test, ctx)) break;
    tickIterations(ctx.budget, 1, "`for` loop");
    try {
      runBlockStatements(stmt.body.body, ctx);
    } catch (err) {
      if (err instanceof ContinueSignal) { /* fall through to update */ }
      else if (err instanceof BreakSignal) return;
      else throw err;
    }
    if (stmt.update) evaluate(stmt.update, ctx);
  }
}

/** Run a `while (cond) { … }` STATEMENT. */
function runWhileStatement(
  stmt: { test: Expression; body: BlockExpr },
  ctx: EvaluationContext,
): void {
  while (evaluate(stmt.test, ctx)) {
    tickIterations(ctx.budget, 1, "`while` loop");
    try {
      runBlockStatements(stmt.body.body, ctx);
    } catch (err) {
      if (err instanceof ContinueSignal) continue;
      if (err instanceof BreakSignal) return;
      throw err;
    }
  }
}

/** Run a `do { … } while (cond)` STATEMENT — body runs at least once. */
function runDoWhileStatement(
  stmt: { test: Expression; body: BlockExpr },
  ctx: EvaluationContext,
): void {
  while (true) {
    tickIterations(ctx.budget, 1, "`do…while` loop");
    try {
      runBlockStatements(stmt.body.body, ctx);
    } catch (err) {
      if (err instanceof ContinueSignal) { /* fall through to test */ }
      else if (err instanceof BreakSignal) return;
      else throw err;
    }
    if (!evaluate(stmt.test, ctx)) break;
  }
}

/**
 * Apply a destructuring declaration: `let [a, b, ...rest] = arr` or
 * `let {x, y: alias, z = 1, ...rest} = obj`. Evaluates the right-hand
 * side once and binds each pattern slot into `ctx.loopVars`.
 */
function runDestructureStatement(
  stmt: {
    patternKind: "array" | "object";
    bindings: ReadonlyArray<{
      name: string;
      sourceKey?: string;
      rest?: boolean;
      defaultValue?: Expression;
    }>;
    expression: Expression;
  },
  ctx: EvaluationContext,
): void {
  const source = evaluate(stmt.expression, ctx);
  const pairs = resolvePatternBindings(
    { kind: stmt.patternKind, bindings: stmt.bindings as DestructuringPattern["bindings"] },
    source,
    ctx,
  );
  for (const { name, value } of pairs) {
    ctx.loopVars.set(name, value);
  }
}

/**
 * Resolve a destructuring pattern (`{ a, b: c = 1, ...rest }` /
 * `[x, , y, ...rest]`) against a source value into a flat list of
 * `name → value` pairs. Shared by `let`-destructuring statements and
 * destructured function / lambda parameters so both honour defaults,
 * renames, holes, and rest the same way. Does NOT touch `loopVars` —
 * the caller decides how to bind + restore.
 */
export function resolvePatternBindings(
  pattern: DestructuringPattern,
  source: unknown,
  ctx: EvaluationContext,
): Array<{ name: string; value: unknown }> {
  const out: Array<{ name: string; value: unknown }> = [];
  if (pattern.kind === "array") {
    const arr = Array.isArray(source) ? source : [];
    let cursor = 0;
    for (const binding of pattern.bindings) {
      if (binding.rest) {
        out.push({ name: binding.name, value: arr.slice(cursor) });
        cursor = arr.length;
        continue;
      }
      let value: unknown = arr[cursor];
      if (value === undefined && binding.defaultValue) {
        value = evaluate(binding.defaultValue, ctx);
      }
      if (binding.name !== "") out.push({ name: binding.name, value });
      cursor += 1;
    }
    return out;
  }
  const obj = source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : {};
  const consumedKeys = new Set<string>();
  for (const binding of pattern.bindings) {
    if (binding.rest) {
      const remainder: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!consumedKeys.has(key)) remainder[key] = value;
      }
      out.push({ name: binding.name, value: remainder });
      continue;
    }
    const key = binding.sourceKey ?? binding.name;
    consumedKeys.add(key);
    let value: unknown = obj[key];
    if (value === undefined && binding.defaultValue) {
      value = evaluate(binding.defaultValue, ctx);
    }
    out.push({ name: binding.name, value });
  }
  return out;
}

/** Run a `for (let key in obj) { … }` STATEMENT — iterates enumerable string keys. */
function runForInStatement(
  stmt: { item: string; iterable: Expression; body: BlockExpr },
  ctx: EvaluationContext,
): void {
  const value = evaluate(stmt.iterable, ctx);
  if (value == null || typeof value !== "object") return;
  const itemHad = ctx.loopVars.has(stmt.item);
  const itemPrev = ctx.loopVars.get(stmt.item);
  try {
    // Enumerate as JS would: own + inherited enumerable string keys, which
    // for the array case yields indices as strings (matches the spec).
    for (const key in value as Record<string, unknown>) {
      tickIterations(ctx.budget, 1, "`for…in` loop");
      ctx.loopVars.set(stmt.item, key);
      try {
        runBlockStatements(stmt.body.body, ctx);
      } catch (err) {
        if (err instanceof ContinueSignal) continue;
        if (err instanceof BreakSignal) return;
        throw err;
      }
    }
  } finally {
    if (itemHad) ctx.loopVars.set(stmt.item, itemPrev);
    else ctx.loopVars.delete(stmt.item);
  }
}

/** Run a `try { … } catch (e) { … } finally { … }` STATEMENT. */
function runTryStatement(
  stmt: {
    block: BlockExpr;
    catchParam?: string;
    catchBlock?: BlockExpr;
    finallyBlock?: BlockExpr;
  },
  ctx: EvaluationContext,
): void {
  try {
    runBlockStatements(stmt.block.body, ctx);
  } catch (err) {
    // Propagate control-flow signals — they're not "exceptions" the
    // author can catch.
    if (err instanceof BreakSignal || err instanceof ContinueSignal || err instanceof ReturnSignal) {
      throw err;
    }
    if (stmt.catchBlock) {
      const name = stmt.catchParam;
      const had = name ? ctx.loopVars.has(name) : false;
      const prev = name ? ctx.loopVars.get(name) : undefined;
      if (name) ctx.loopVars.set(name, err);
      try {
        runBlockStatements(stmt.catchBlock.body, ctx);
      } finally {
        if (name) {
          if (had) ctx.loopVars.set(name, prev);
          else ctx.loopVars.delete(name);
        }
      }
    }
  } finally {
    if (stmt.finallyBlock) {
      runBlockStatements(stmt.finallyBlock.body, ctx);
    }
  }
}

/**
 * Walk a block of statements, executing each one in order. Used by the
 * loop / conditional / try runners so the body grammar stays uniform
 * with `evaluateBlock` (which is the value-producing variant used by
 * lambdas and function declarations).
 */
function runBlockStatements(
  body: ReadonlyArray<Statement>,
  ctx: EvaluationContext,
): void {
  for (const stmt of body) {
    runStatementInBlock(stmt, ctx);
  }
}

/**
 * Public entry point for the effect / action runners — they delegate
 * control-flow statements (`if`, `for`, `while`, `switch`, `try`,
 * `break`, `continue`, `throw`) to this helper so the same semantics
 * apply everywhere. Returns nothing; `BreakSignal`, `ContinueSignal`,
 * and `ReturnSignal` are thrown for the caller's loop / function frame
 * to catch.
 */
export function runControlFlowStatement(stmt: Statement, ctx: EvaluationContext): void {
  runStatementInBlock(stmt, ctx);
}

function runStatementInBlock(stmt: Statement, ctx: EvaluationContext): void {
  switch (stmt.kind) {
    case "ExpressionStatement":
      evaluate(stmt.expression, ctx);
      return;
    case "Assignment": {
      const value = evaluate(stmt.expression, ctx);
      if (stmt.identifier) {
        if (stmt.isState) {
          const target = resolveStateAlias(ctx, stmt.identifier);
          ctx.state.set(target, value as never);
        } else if (ctx.bindings.has(stmt.identifier) && !ctx.loopVars.has(stmt.identifier)) {
          // Assignment to a top-level `let`/`var`/plain binding inside an
          // imperative body (e.g. `badges = [...badges, …]` in a `for`
          // body). Route to the per-render mutable slot so it does NOT
          // leak into `loopVars` and accumulate across renders.
          ctx.mutableBindings.set(stmt.identifier, value);
        } else {
          ctx.loopVars.set(stmt.identifier, value);
        }
      }
      return;
    }
    case "IfStatement":
      runIfStatement(stmt, ctx);
      return;
    case "SwitchStatement":
      runSwitchStatement(stmt, ctx);
      return;
    case "ForOfStatement":
      runForOfStatement(stmt, ctx);
      return;
    case "ForClassicStatement":
      runForClassicStatement(stmt, ctx);
      return;
    case "ForInStatement":
      runForInStatement(stmt, ctx);
      return;
    case "WhileStatement":
      runWhileStatement(stmt, ctx);
      return;
    case "DoWhileStatement":
      runDoWhileStatement(stmt, ctx);
      return;
    case "DestructureStatement":
      runDestructureStatement(stmt, ctx);
      return;
    case "TryStatement":
      runTryStatement(stmt, ctx);
      return;
    case "BreakStatement":
      throw new BreakSignal();
    case "ContinueStatement":
      throw new ContinueSignal();
    case "ThrowStatement": {
      const value = evaluate(stmt.argument, ctx);
      throw value;
    }
    case "Return": {
      const value = stmt.argument ? evaluate(stmt.argument, ctx) : undefined;
      throw new ReturnSignal(value);
    }
    case "Await":
      evaluate(stmt.argument, ctx);
      return;
    default:
      return;
  }
}

/** Evaluate `expr(...args)` — call postfix on an arbitrary expression / IIFE. */
/** True when a `Member` chain bottoms out at a `$state` reference. */
function memberChainRootsAtState(expr: Expression): boolean {
  let cursor: Expression = expr;
  while (cursor.kind === "Member") cursor = cursor.object;
  // A reserved namespace root (`$util.format`, `$storage.local`) is NOT
  // fine-grained reactive state — let it fall through to the normal member
  // path so the StateRef resolves to the namespace object and `memberAccess`
  // reads off it.
  if (cursor.kind === "StateRef" &&
      (Object.prototype.hasOwnProperty.call(RESERVED_STATE_NAMESPACES, cursor.name) ||
        RESERVED_CONTEXT_NAMESPACES.has(cursor.name))) {
    return false;
  }
  return cursor.kind === "StateRef";
}

/**
 * Evaluate a member chain rooted at a `$atom`, recording the *precise* path
 * it reads in `ctx.trackedState` so the reader subscribes only to that path
 * (fine-grained reactivity).
 *
 * The path is refined segment-by-segment through plain-object property
 * accesses (`$user.address.city` → `user.address.city`). Refinement stops —
 * and the dependency becomes the container path read so far — as soon as the
 * chain reaches an **array** (`$rows.name` pluck, `$cart.items[0]`), a
 * **dynamic computed key** (`$list[$i]`), or a primitive/`null`. That rule is
 * the whole contract: *object fields are tracked field-by-field; reading into
 * an array (or via a dynamic key) subscribes to the array/container.* It is
 * always sound — coarsening can only ever subscribe to MORE than is read,
 * never less — so a relevant change is never missed.
 *
 * Values are produced with the same `memberAccess` / `computedMemberAccess`
 * helpers the plain `Member` path uses, so array pluck, `.length`/`.first`/
 * `.last`, bounded indices, and string indexing behave identically. Dynamic
 * key sub-expressions are still evaluated, so their own dependencies are
 * tracked.
 */
function evaluateStateMember(expr: Expression, ctx: EvaluationContext): unknown {
  const accesses = flattenMemberAccesses(expr);
  // `cursor` is the rooting StateRef (guaranteed by `memberChainRootsAtState`).
  let cursor: Expression = expr;
  while (cursor.kind === "Member") cursor = cursor.object;
  const root = resolveStateAlias(ctx, (cursor as { name: string }).name);
  return walkAtomMember(accesses, root, ctx);
}

/** Flatten a `Member` chain into root → leaf access order. */
function flattenMemberAccesses(
  expr: Expression,
): Array<{ property?: string; computed?: Expression }> {
  const accesses: Array<{ property?: string; computed?: Expression }> = [];
  let cursor: Expression = expr;
  while (cursor.kind === "Member") {
    accesses.unshift({ property: cursor.property, computed: cursor.computed });
    cursor = cursor.object;
  }
  return accesses;
}

/**
 * Walk `accesses` from the reactive atom `atomName`, returning the value and
 * recording the precise path read in `ctx.trackedState`. Shared by `$state`
 * reads and `Store` reads — both bottom out at a single reactive atom that
 * holds an object graph, so the fine-grained refinement rule is identical.
 */
function walkAtomMember(
  accesses: Array<{ property?: string; computed?: Expression }>,
  atomName: string,
  ctx: EvaluationContext,
): unknown {
  let value: unknown = ctx.state.get(atomName);
  const pathSegs: string[] = [atomName];
  let refining = true;

  for (const acc of accesses) {
    let key: unknown;
    let staticSegment: string | null = null; // appendable static path segment, else null
    if (acc.computed) {
      if (acc.computed.kind === "Literal") {
        key = acc.computed.value;
        if (typeof key === "string" || typeof key === "number") staticSegment = String(key);
      } else {
        // Dynamic key — evaluate it so ITS dependencies are tracked too.
        key = evaluate(acc.computed, ctx);
      }
    } else {
      key = acc.property ?? "";
      staticSegment = acc.property ?? "";
    }

    // Refine the path only while we're walking plain objects with a static
    // key. Arrays, dynamic keys, and primitives stop refinement.
    const isPlainObject = value != null && typeof value === "object" && !Array.isArray(value);
    if (refining && staticSegment !== null && isPlainObject) {
      pathSegs.push(staticSegment);
    } else {
      refining = false;
    }

    value = acc.computed
      ? computedMemberAccess(value, key)
      : memberAccess(value, acc.property ?? "");
  }

  ctx.trackedState.add(pathSegs.join("."));
  return value;
}

/**
 * If `expr` is a member chain whose root identifier resolves to a `Store`
 * handle (`cart.items`, `s.user.name`), return that handle; otherwise `null`.
 * Stores are always bound to a simple identifier, so we only need to evaluate
 * the root (a cheap, cached binding/loop-var lookup).
 */
function storeChainRootHandle(expr: Expression, ctx: EvaluationContext): StoreHandle | null {
  let cursor: Expression = expr;
  while (cursor.kind === "Member") cursor = cursor.object;
  if (cursor.kind !== "Identifier") return null;
  const value = evaluate(cursor, ctx);
  return isStoreHandle(value) ? value : null;
}

/**
 * Evaluate a member chain rooted at a `Store` handle. A leading method name
 * (`cart.add`) returns the pre-bound method; anything else is a state read
 * that walks the store's atom with the same fine-grained tracking as
 * `$state` (`cart.items` → subscribe to `<atom>.items`).
 */
function evaluateStoreMember(
  expr: Expression,
  ctx: EvaluationContext,
  handle: StoreHandle,
): unknown {
  const accesses = flattenMemberAccesses(expr);
  const first = accesses[0];
  if (first && first.computed === undefined && first.property !== undefined &&
      Object.prototype.hasOwnProperty.call(handle.__methods, first.property)) {
    // Method reference (`cart.add`). Apply any deeper accesses to the bound
    // function (rare, e.g. reading a property off it).
    let value: unknown = handle.__methods[first.property];
    for (let i = 1; i < accesses.length; i += 1) {
      const acc = accesses[i]!;
      if (acc.computed) value = computedMemberAccess(value, evaluate(acc.computed, ctx));
      else value = memberAccess(value, acc.property ?? "");
    }
    return value;
  }
  return walkAtomMember(accesses, handle.__atom, ctx);
}

/**
 * Evaluate `Store({ ...state, ...methods })`. Splits the config into reactive
 * state (non-function entries, held in a single atom) and methods (function
 * entries, pre-bound to receive the handle as their first argument). Returns
 * a singleton handle per call site so the store is a stable, app-global
 * value across renders.
 */
function evaluateStoreCall(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const key = loc ? `${loc.line}:${loc.column}` : `anon:${ctx.stores.size}`;
  const cached = ctx.stores.get(key);
  if (cached) return cached;

  const config = args[0] ? evaluate(args[0], ctx) : {};
  const state: Record<string, unknown> = {};
  const rawMethods: Record<string, (...a: unknown[]) => unknown> = {};
  // `persist` (string key or `true`) and `persistIn` ("local" | "session")
  // are configuration, not state fields or methods — pull them out first so
  // they never leak into the store's reactive data or method surface.
  let persistKey: string | null = null;
  let persistArea: "local" | "session" = "local";
  // `history` (true | depth number) opts into undo/redo (VII.3).
  let historyEnabled = false;
  let historyDepth = 50;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    for (const [name, value] of Object.entries(config as Record<string, unknown>)) {
      if (name === "persist") {
        if (value === true) persistKey = `aktion:store:${key}`;
        else if (typeof value === "string" && value) persistKey = value;
        continue;
      }
      if (name === "persistIn") {
        if (value === "session") persistArea = "session";
        continue;
      }
      if (name === "history") {
        if (value === true) historyEnabled = true;
        else if (typeof value === "number" && value > 0) { historyEnabled = true; historyDepth = Math.floor(value); }
        continue;
      }
      if (typeof value === "function") rawMethods[name] = value as (...a: unknown[]) => unknown;
      else state[name] = value;
    }
  }
  // The user-declared field keys (before any meta fields) — used for both
  // persistence hydration and history snapshots so meta never round-trips.
  const userFieldKeys = Object.keys(state);

  const atom = loc ? `__store_${loc.line}_${loc.column}` : `__store_anon_${ctx.stores.size}`;
  // Hydrate persisted fields over the declared defaults BEFORE declaring the
  // atom, so the first render already shows the restored values. Only keys the
  // store declares are restored — a renamed/removed field in storage is
  // ignored, and a newly-added field keeps its code default.
  if (persistKey) {
    const stored = readPersistedStore(persistKey, persistArea);
    if (stored) {
      for (const k of userFieldKeys) {
        if (Object.prototype.hasOwnProperty.call(stored, k)) state[k] = stored[k];
      }
    }
  }
  // Seed the reactive undo/redo flags so `store.canUndo` / `.canRedo` are
  // readable from the first render.
  if (historyEnabled) {
    state.canUndo = false;
    state.canRedo = false;
  }
  ctx.state.declare(atom, state);

  const methods: Record<string, (...args: unknown[]) => unknown> = {};
  const handle: StoreHandle = { __kind: "Store", __atom: atom, __methods: methods };
  // Pre-bind each method to inject the handle as `s`. The bound functions are
  // created once, so a `store.action` reference is stable across renders.
  for (const [name, raw] of Object.entries(rawMethods)) {
    methods[name] = (...callArgs: unknown[]) => raw(handle, ...callArgs);
  }

  // Persist on every change to this store's atom (or any nested path under it).
  if (persistKey) {
    const prefix = `${atom}.`;
    const unsub = ctx.state.subscribe((changed) => {
      let hit = false;
      for (const path of changed) {
        if (path === atom || path.startsWith(prefix)) { hit = true; break; }
      }
      if (hit) writePersistedStore(persistKey as string, persistArea, ctx.state.get(atom));
    });
    ctx.disposers.push(unsub);
  }

  // Undo/redo history (VII.3). Snapshots capture ONLY the user fields; the
  // `canUndo`/`canRedo` flags are kept in sync as reactive state so a disabled
  // toolbar button updates automatically.
  if (historyEnabled) {
    attachStoreHistory(ctx, atom, userFieldKeys, historyDepth, methods);
  }

  ctx.stores.set(key, handle);
  return handle;
}

/**
 * Wire undo/redo onto a store atom. Maintains `past` / `future` snapshot
 * stacks of the user fields, pushing the previous snapshot on each user-driven
 * mutation and clearing the redo stack. Adds `undo` / `redo` / `clearHistory`
 * methods to the store and keeps the reactive `canUndo` / `canRedo` flags in
 * sync. Programmatic restores are flagged so they aren't recorded as new edits.
 */
function attachStoreHistory(
  ctx: EvaluationContext,
  atom: string,
  userFieldKeys: string[],
  depth: number,
  methods: Record<string, (...args: unknown[]) => unknown>,
): void {
  const prefix = `${atom}.`;
  const past: Array<Record<string, unknown>> = [];
  const future: Array<Record<string, unknown>> = [];
  let programmatic = false;

  const snap = (): Record<string, unknown> => {
    const v = ctx.state.get(atom) as Record<string, unknown> | undefined;
    const out: Record<string, unknown> = {};
    for (const k of userFieldKeys) out[k] = v ? v[k] : undefined;
    return out;
  };
  let lastSnap = snap();

  const applySnap = (s: Record<string, unknown>): void => {
    for (const k of userFieldKeys) ctx.state.setPath(atom, [k], s[k] as never);
  };
  const updateFlags = (): void => {
    ctx.state.setPath(atom, ["canUndo"], (past.length > 0) as never);
    ctx.state.setPath(atom, ["canRedo"], (future.length > 0) as never);
  };
  const isUserChange = (changed: ReadonlySet<string>): boolean => {
    for (const p of changed) {
      if (p === atom) return true;
      if (p.startsWith(prefix)) {
        const top = p.slice(prefix.length).split(".")[0];
        if (top !== "canUndo" && top !== "canRedo") return true;
      }
    }
    return false;
  };

  const unsub = ctx.state.subscribe((changed) => {
    if (!isUserChange(changed)) return;
    if (programmatic) {
      // Our own undo/redo restore — refresh the baseline, don't record it.
      programmatic = false;
      lastSnap = snap();
      return;
    }
    past.push(lastSnap);
    if (past.length > depth) past.shift();
    future.length = 0;
    lastSnap = snap();
    updateFlags();
  });
  ctx.disposers.push(unsub);

  methods.undo = (): void => {
    if (past.length === 0) return;
    future.push(snap());
    const prev = past.pop() as Record<string, unknown>;
    programmatic = true;
    applySnap(prev);
    lastSnap = prev;
    updateFlags();
  };
  methods.redo = (): void => {
    if (future.length === 0) return;
    past.push(snap());
    const next = future.pop() as Record<string, unknown>;
    programmatic = true;
    applySnap(next);
    lastSnap = next;
    updateFlags();
  };
  methods.clearHistory = (): void => {
    past.length = 0;
    future.length = 0;
    updateFlags();
  };
}

/**
 * `$form({ values, rules?, onSubmit? })` — a reactive form engine (V.1).
 *
 * Backed by a store atom (so it gets fine-grained reads + two-way binding for
 * free) holding `{ values, errors, touched, valid, submitting }`. Returns a
 * branded store handle, so `form.values.email` two-way binds and
 * `form.errors.email` / `form.valid` read reactively. Methods:
 *   - `form.field(name)` → `{ value, error, name, onChange, onBlur }` to spread
 *     onto an `Input(...)` for a fully controlled, validated field.
 *   - `form.setField(name, value)` / `form.setValues({...})`
 *   - `form.validate()` (all fields) / `form.validateField(name)`
 *   - `form.touch(name)` (mark touched + validate that field)
 *   - `form.handleSubmit(extra?)` → validate, then call `onSubmit(values)` if valid
 *   - `form.reset()`
 *
 * `rules` is `{ field: [validators] }` using the `$util.rules.*` validators.
 */
function evaluateFormCall(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const key = loc ? `${loc.line}:${loc.column}` : `form:${ctx.stores.size}`;
  const cached = ctx.stores.get(key);
  if (cached) return cached;

  const cfg = (args[0] ? evaluate(args[0], ctx) : {}) as Record<string, unknown>;
  const config = (cfg && typeof cfg === "object" && !Array.isArray(cfg)) ? cfg : {};
  const initialValues = (config.values && typeof config.values === "object" && !Array.isArray(config.values))
    ? { ...config.values as Record<string, unknown> } : {};
  const rules = (config.rules && typeof config.rules === "object" && !Array.isArray(config.rules))
    ? config.rules as Record<string, unknown> : {};
  const onSubmit = typeof config.onSubmit === "function" ? config.onSubmit as (...a: unknown[]) => unknown : null;

  const atom = loc ? `__form_${loc.line}_${loc.column}` : `__form_anon_${ctx.stores.size}`;
  const freshState = (): Record<string, unknown> => ({ values: { ...initialValues }, errors: {}, touched: {}, dirty: false, valid: true, submitting: false, validating: false });
  ctx.state.declare(atom, freshState());

  const methods: Record<string, (...a: unknown[]) => unknown> = {};
  const handle: StoreHandle = { __kind: "Store", __atom: atom, __methods: methods };

  const stateOf = (): Record<string, unknown> => (ctx.state.get(atom) as Record<string, unknown>) ?? {};
  const valuesOf = (): Record<string, unknown> => {
    const v = stateOf().values;
    return (v && typeof v === "object") ? v as Record<string, unknown> : {};
  };
  const isThenable = (v: unknown): v is Promise<unknown> =>
    Boolean(v) && typeof (v as { then?: unknown }).then === "function";
  // Track in-flight async validations so `validating` reads true while any
  // `asyncCustom` rule is pending (and stale resolutions can be ignored).
  let pendingValidations = 0;
  const beginValidation = (): void => {
    pendingValidations += 1;
    ctx.state.setPath(atom, ["validating"], true as never);
  };
  const endValidation = (): void => {
    pendingValidations = Math.max(0, pendingValidations - 1);
    if (pendingValidations === 0) ctx.state.setPath(atom, ["validating"], false as never);
  };

  // `dirty` derives from comparing live values to the last clean snapshot —
  // a store subscription means it also flips on two-way binding writes
  // (`Input("email", { value: form.values.email })`), not just setField().
  let cleanSnapshot = JSON.stringify(initialValues);
  const safeStringify = (v: unknown): string => { try { return JSON.stringify(v) ?? ""; } catch { return ""; } };
  const valuesPrefix = `${atom}.values`;
  const unsubscribeDirty = ctx.state.subscribe((changed) => {
    let relevant = false;
    for (const p of changed) {
      if (p === atom || p === valuesPrefix || p.startsWith(`${valuesPrefix}.`)) { relevant = true; break; }
    }
    if (!relevant) return;
    const isDirty = safeStringify(valuesOf()) !== cleanSnapshot;
    if (stateOf().dirty !== isDirty) ctx.state.setPath(atom, ["dirty"], isDirty as never);
  });
  ctx.disposers.push(unsubscribeDirty);

  methods.setField = (name: unknown, value: unknown): void => {
    const n = String(name);
    ctx.state.setPath(atom, ["values", n], value as never);
    ctx.state.setPath(atom, ["errors", n], undefined as never);
    ctx.state.setPath(atom, ["dirty"], true as never);
  };
  methods.setValues = (obj: unknown): void => {
    const merged = { ...valuesOf(), ...((obj && typeof obj === "object") ? obj as Record<string, unknown> : {}) };
    ctx.state.setPath(atom, ["values"], merged as never);
    ctx.state.setPath(atom, ["dirty"], true as never);
  };
  methods.validateField = (name: unknown): string | null | Promise<string | null> => {
    const n = String(name);
    const valueAtCheck = valuesOf()[n];
    const msg = Rules.validate(valueAtCheck, rules[n]);
    if (isThenable(msg)) {
      beginValidation();
      return (msg as Promise<string | null>).then((m) => {
        endValidation();
        // Ignore a stale resolution if the field changed while validating.
        if (valuesOf()[n] !== valueAtCheck) return m ?? null;
        ctx.state.setPath(atom, ["errors", n], (m ?? undefined) as never);
        return m ?? null;
      });
    }
    ctx.state.setPath(atom, ["errors", n], (msg ?? undefined) as never);
    return msg ?? null;
  };
  methods.touch = (name: unknown): void => {
    const n = String(name);
    ctx.state.setPath(atom, ["touched", n], true as never);
    void methods.validateField!(n);
  };
  const applyErrors = (errors: Record<string, string>): boolean => {
    ctx.state.setPath(atom, ["errors"], errors as never);
    const valid = Object.keys(errors).length === 0;
    ctx.state.setPath(atom, ["valid"], valid as never);
    return valid;
  };
  methods.validate = (): boolean | Promise<boolean> => {
    const errors = Rules.validateAll(valuesOf(), rules);
    if (isThenable(errors)) {
      beginValidation();
      return (errors as Promise<Record<string, string>>).then((e) => { endValidation(); return applyErrors(e); });
    }
    return applyErrors(errors as Record<string, string>);
  };
  methods.handleSubmit = (extra?: unknown): unknown => {
    const touched: Record<string, boolean> = {};
    for (const k of Object.keys(rules)) touched[k] = true;
    const prevTouched = stateOf().touched;
    ctx.state.setPath(atom, ["touched"], { ...((prevTouched && typeof prevTouched === "object") ? prevTouched as Record<string, unknown> : {}), ...touched } as never);
    const submitWhenValid = (valid: boolean): unknown => {
      if (!valid || !onSubmit) return valid;
      ctx.state.setPath(atom, ["submitting"], true as never);
      let result: unknown;
      try {
        result = onSubmit(valuesOf(), extra);
      } catch (err) {
        ctx.state.setPath(atom, ["submitting"], false as never);
        throw err;
      }
      // Keep `submitting` true for the whole async submit — it only clears
      // once the returned promise settles (sync submits clear immediately).
      if (isThenable(result)) {
        return (result as Promise<unknown>).finally(() => ctx.state.setPath(atom, ["submitting"], false as never));
      }
      ctx.state.setPath(atom, ["submitting"], false as never);
      return valid;
    };
    const validity = methods.validate!();
    if (isThenable(validity)) return (validity as Promise<boolean>).then(submitWhenValid);
    return submitWhenValid(validity as boolean);
  };
  // Spec V.1 names this `.submit()` — keep both spellings.
  methods.submit = (extra?: unknown): unknown => methods.handleSubmit!(extra);
  methods.reset = (): void => {
    const fresh = freshState();
    cleanSnapshot = safeStringify(fresh.values); // new clean baseline
    ctx.state.setPath(atom, ["values"], fresh.values as never);
    ctx.state.setPath(atom, ["errors"], {} as never);
    ctx.state.setPath(atom, ["touched"], {} as never);
    ctx.state.setPath(atom, ["dirty"], false as never);
    ctx.state.setPath(atom, ["valid"], true as never);
    ctx.state.setPath(atom, ["submitting"], false as never);
    ctx.state.setPath(atom, ["validating"], false as never);
  };
  methods.field = (name: unknown): Record<string, unknown> => {
    const n = String(name);
    // Subscribe the current render to this field's slices so it re-renders
    // when the value / error / touched flag changes.
    ctx.trackedState.add(`${atom}.values.${n}`);
    ctx.trackedState.add(`${atom}.errors.${n}`);
    ctx.trackedState.add(`${atom}.touched.${n}`);
    const st = stateOf();
    const errors = (st.errors && typeof st.errors === "object") ? st.errors as Record<string, unknown> : {};
    const touched = (st.touched && typeof st.touched === "object") ? st.touched as Record<string, unknown> : {};
    return {
      name: n,
      value: valuesOf()[n] ?? "",
      error: touched[n] ? errors[n] : undefined,
      onChange: (v: unknown) => methods.setField!(n, v),
      onBlur: () => methods.touch!(n),
    };
  };

  ctx.stores.set(key, handle);
  return handle;
}

/** Resolve the Web Storage backend for store persistence, or null in SSR. */
function persistBackend(area: "local" | "session"): Storage | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
  try {
    return (area === "session" ? g.sessionStorage : g.localStorage) ?? null;
  } catch {
    // Accessing storage can throw in sandboxed/blocked contexts.
    return null;
  }
}

/** Read + parse a persisted store snapshot. Returns null on any failure. */
function readPersistedStore(key: string, area: "local" | "session"): Record<string, unknown> | null {
  const backend = persistBackend(area);
  if (!backend) return null;
  try {
    const raw = backend.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Serialise + write a store snapshot. Silently no-ops on any failure. */
function writePersistedStore(key: string, area: "local" | "session", value: unknown): void {
  const backend = persistBackend(area);
  if (!backend) return;
  try {
    backend.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / unserialisable value — drop the write rather than throw.
  }
}


/**
 * Like `extractStatePath`, but for a member chain rooted at a `Store` handle.
 * Returns the backing atom name + the trailing dotted path so a write
 * (`s.items = …`) or a two-way binding (`value: cart.draft`) can route
 * through `setPath` on the store's atom. Returns `null` when the chain isn't
 * store-rooted or uses a dynamic key.
 */
function extractStorePath(
  expr: Expression,
  ctx: EvaluationContext,
): { atom: string; path: string[] } | null {
  const segments: string[] = [];
  let cursor: Expression = expr;
  while (cursor.kind === "Member") {
    if (cursor.computed) {
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
  if (cursor.kind !== "Identifier") return null;
  const value = evaluate(cursor, ctx);
  if (!isStoreHandle(value)) return null;
  return { atom: value.__atom, path: segments };
}

function evaluateInvoke(
  expr: { callee: Expression; arguments: Expression[]; optional?: boolean; loc?: { line: number; column: number } },
  ctx: EvaluationContext,
): unknown {
  // Every Aktion-provided global is `$`-prefixed, so a `$name(...)` call lexes
  // as an Invoke on a `StateRef`. We dispatch those here — hooks, the runtime
  // factory builtins, and user-declared `$useFoo` hooks — BEFORE resolving the
  // name as a stored state value. (`$effect(...)` is handled in the parser, so
  // its dependency array keeps its special parsing.) Any other `$name(...)`
  // (e.g. invoking a lambda stored in state) falls through to the normal path.
  if (expr.callee.kind === "StateRef") {
    const name = expr.callee.name;
    // Hooks.
    if (name === "state") return evaluateStateHook(expr.arguments, ctx, expr.loc);
    if (name === "memo") return evaluateMemoHook(expr.arguments, ctx, expr.loc);
    if (name === "ref") return evaluateRefHook(expr.arguments, ctx, expr.loc);
    if (name === "reducer") return evaluateReducerHook(expr.arguments, ctx, expr.loc);
    if (name === "id") return evaluateIdHook(expr.arguments, ctx, expr.loc);
    // Runtime factory builtins.
    switch (name) {
      case "store":
        return evaluateStoreCall(expr.arguments, ctx, expr.loc);
      case "form":
        return evaluateFormCall(expr.arguments, ctx, expr.loc);
      case "router":
        return evaluateRouterCall(expr.arguments, ctx, expr.loc);
      case "http": {
        const optsArg = expr.arguments[0];
        return createHttpResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "query": {
        const optsArg = expr.arguments[0];
        return createQueryResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "mutation": {
        const optsArg = expr.arguments[0];
        return createMutationResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "socket": {
        const optsArg = expr.arguments[0];
        return createSocketResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "sse": {
        const optsArg = expr.arguments[0];
        return createSseResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "script": {
        const optsArg = expr.arguments[0];
        return createScriptResource(optsArg ? evaluate(optsArg, ctx) : {}, ctx);
      }
      case "head": {
        // Apply the head contribution for this render pass. Evaluating the
        // config here subscribes the render to any `$state` it reads, so a
        // reactive title / meta re-applies on change.
        const optsArg = expr.arguments[0];
        getHeadManager(ctx).apply(optsArg ? evaluate(optsArg, ctx) : {});
        return null;
      }
      case "theme": {
        const tokensArg = expr.arguments[0];
        const themeInput = tokensArg ? evaluate(tokensArg, ctx) : null;
        // Side effects: register custom icons declared via
        // `$theme({ icons: { name: "<svg markup>" } })` (IX.2) and load any
        // web fonts declared via `$theme({ fonts: { import: [...] } })` (I.7).
        if (themeInput && typeof themeInput === "object" && !Array.isArray(themeInput)) {
          const obj = themeInput as Record<string, unknown>;
          if (obj.icons) registerIcons(obj.icons);
          // `import` may live under the `fonts` group or the existing `font`
          // group — accept both shapes.
          if (obj.fonts) loadFonts(obj.fonts);
          if (obj.font) loadFonts(obj.font);
        }
        // A `name` property selects a built-in theme (e.g.
        // `$theme({ name: "neon" })`) — seed the full token set from that
        // theme so the whole palette applies, then let any structured
        // overrides (`colors`, `radius`, ...) layer on top.
        const tokens = collectThemeTokens(themeInput);
        const themeName = resolveBuiltInThemeName(themeInput);
        const baseTokens = themeName ? builtInThemes[themeName] : null;
        const merged = baseTokens ? { ...baseTokens, ...tokens } : tokens;
        return { kind: "Theme", tokens: merged } satisfies ThemeNode;
      }
      case "app": {
        // Runtime root. `$app(node)` renders that node; `$app([a, b])` or
        // `$app(a, b)` render the nodes as sibling roots (the renderer wraps a
        // list in a document fragment). The collected value populates the
        // reserved `aktion` binding (see installStatementBinding) that the
        // element renders each tick.
        const args = expr.arguments;
        if (args.length === 1) return evaluate(args[0]!, ctx);
        return args.map((a) => evaluate(a, ctx));
      }
      case "i18n": {
        const configArg = expr.arguments[0];
        const config = configArg ? evaluate(configArg, ctx) : null;
        const cfg = config && typeof config === "object" && !Array.isArray(config)
          ? (config as I18nConfig)
          : {};
        return createI18n(cfg);
      }
      case "emit": {
        const eventName = expr.arguments[0] ? String(evaluate(expr.arguments[0], ctx)) : "";
        const detail = expr.arguments[1] ? evaluate(expr.arguments[1], ctx) : undefined;
        ctx.onEmit?.(eventName, detail);
        return undefined;
      }
      case "storage": {
        // `$storage({...})` factory form — returns the storage namespace.
        if (expr.arguments[0]) evaluate(expr.arguments[0], ctx);
        return storageGlobal;
      }
      case "optimistic":
        return runOptimistic(expr.arguments[0], ctx);
    }
    const hookDecl = ctx.hookDecls.get(name);
    if (hookDecl) return invokeHookDecl(hookDecl, expr.arguments, ctx);
  }
  const callee = evaluate(expr.callee, ctx);
  if (callee == null) {
    return expr.optional ? undefined : null;
  }
  if (typeof callee !== "function") return null;
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
  try {
    return (callee as (...a: unknown[]) => unknown).apply(undefined, positional);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[aktion] call expression threw`, err);
    return null;
  }
}

/** Evaluate `new Constructor(args)`. */
function evaluateNew(
  expr: { callee: Expression; arguments: Expression[] },
  ctx: EvaluationContext,
): unknown {
  const callee = evaluate(expr.callee, ctx);
  if (typeof callee !== "function") return null;
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
  try {
    return Reflect.construct(callee as new (...a: unknown[]) => unknown, positional);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[aktion] \`new\` threw`, err);
    return null;
  }
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

/** A component-local declaration's prior registration, for block-scoped restore. */
interface LocalDeclSnapshot {
  kind: "component" | "action" | "hook";
  name: string;
  had: boolean;
  prev: unknown;
}

/** Snapshot the current registration of a soon-to-be-shadowed local decl. */
function rememberLocalDecl(
  stmt: ComponentDeclaration | ActionDeclaration | HookDeclaration,
  ctx: EvaluationContext,
  out: LocalDeclSnapshot[],
): void {
  if (stmt.kind === "ComponentDeclaration") {
    out.push({ kind: "component", name: stmt.name, had: ctx.componentDecls.has(stmt.name), prev: ctx.componentDecls.get(stmt.name) });
  } else if (stmt.kind === "ActionDeclaration") {
    out.push({ kind: "action", name: stmt.name, had: ctx.actionDecls.has(stmt.name), prev: ctx.actionDecls.get(stmt.name) });
  } else {
    out.push({ kind: "hook", name: stmt.name, had: ctx.hookDecls.has(stmt.name), prev: ctx.hookDecls.get(stmt.name) });
  }
}

/** Restore (or remove) component-local declarations when a block unwinds. */
function restoreLocalDecls(ctx: EvaluationContext, snapshots: LocalDeclSnapshot[]): void {
  for (let i = snapshots.length - 1; i >= 0; i -= 1) {
    const s = snapshots[i]!;
    const map = s.kind === "component" ? ctx.componentDecls
      : s.kind === "action" ? ctx.actionDecls
      : ctx.hookDecls;
    if (s.had) (map as Map<string, unknown>).set(s.name, s.prev);
    else (map as Map<string, unknown>).delete(s.name);
  }
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
  // Component/action/hook declarations introduced by THIS block, with their
  // prior registration (if any) so they can be restored when the block exits.
  const localDecls: LocalDeclSnapshot[] = [];
  try {
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
            // Generic block (lambda body, if/switch arm, for body, …):
            // `$x = expr` writes to the reactive state store, resolving
            // through the per-instance alias stack so user-component
            // scopes hit the right slot (§7).
            const value = evaluate(stmt.expression, ctx);
            ctx.state.set(target, value);
            result = value;
            continue;
          }
          const value = evaluate(stmt.expression, ctx);
          // A non-`$state` assignment to a name that is a top-level
          // binding (`let badges = []`, `i = 10`) targets the per-render
          // mutable slot — NOT `loopVars` — so the write neither leaks
          // across renders nor accumulates (the bug behind "badges shown
          // twice"). A real block-local name (`let row = …`) stays in
          // `loopVars` and is cleaned up when the block unwinds.
          if (ctx.bindings.has(stmt.identifier) && !ctx.loopVars.has(stmt.identifier)) {
            ctx.mutableBindings.set(stmt.identifier, value);
          } else {
            if (!ctx.loopVars.has(stmt.identifier)) introduced.push(stmt.identifier);
            ctx.loopVars.set(stmt.identifier, value);
          }
          result = value;
          continue;
        }
        case "Return":
          result = stmt.argument ? evaluate(stmt.argument, ctx) : undefined;
          return result;
        case "ThrowStatement": {
          const value = evaluate(stmt.argument, ctx);
          throw value;
        }
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
        case "HookDeclaration":
          // Component-local declarations (XIII.4): a `function Row() {...}`
          // nested inside a component / action body is registered so sibling
          // statements can call it, then restored when the block unwinds so it
          // doesn't leak into the global scope (or shadow an outer same-named
          // declaration permanently). We snapshot any prior registration under
          // the same name and reinstate it in `finally`.
          rememberLocalDecl(stmt, ctx, localDecls);
          installStatementBinding(stmt, ctx);
          continue;
        case "Await":
          // Deferred to the action / effect runners; in a pure expression
          // block this is a no-op.
          continue;
        // Control-flow statements — defer to the shared runner. The
        // runners may throw `BreakSignal` / `ContinueSignal` /
        // `ReturnSignal`; we catch ReturnSignal here so the lambda /
        // component body unwinds with the correct value.
        case "IfStatement":
        case "SwitchStatement":
        case "ForOfStatement":
        case "ForClassicStatement":
        case "ForInStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "TryStatement":
        case "BreakStatement":
        case "ContinueStatement":
        case "DestructureStatement":
          runStatementInBlock(stmt, ctx);
          continue;
      }
    }
  } catch (err) {
    if (err instanceof ReturnSignal) {
      return err.value;
    }
    throw err;
  } finally {
    // Restore introduced names so block-local bindings don't leak.
    for (const name of introduced) ctx.loopVars.delete(name);
    // Restore (or remove) component-local declarations introduced by this block.
    restoreLocalDecls(ctx, localDecls);
  }
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
    case "**": return toNumber(left) ** toNumber(right);
    // Loose equality (`==` / `!=`) and strict equality (`===` / `!==`)
    // both compare by identity here — the runtime stores JS primitives
    // so the distinction collapses for the values an Aktion program can
    // produce. Authors writing strict equality still get the same
    // result they would in JS for primitives.
    case "==":
    case "===": return left === right;
    case "!=":
    case "!==": return left !== right;
    case ">": return toNumber(left) > toNumber(right);
    case "<": return toNumber(left) < toNumber(right);
    case ">=": return toNumber(left) >= toNumber(right);
    case "<=": return toNumber(left) <= toNumber(right);
    // Bitwise / shift — JS coerces operands through ToInt32 / ToUint32.
    case "&": return (toInt32(left) & toInt32(right));
    case "|": return (toInt32(left) | toInt32(right));
    case "^": return (toInt32(left) ^ toInt32(right));
    case "<<": return (toInt32(left) << (toUint32(right) & 31));
    case ">>": return (toInt32(left) >> (toUint32(right) & 31));
    case ">>>": return (toUint32(left) >>> (toUint32(right) & 31));
    case "instanceof": {
      if (typeof right !== "function") return false;
      try {
        return left instanceof (right as new (...args: unknown[]) => unknown);
      } catch {
        return false;
      }
    }
    case "in": {
      if (right == null || (typeof right !== "object" && typeof right !== "function")) {
        return false;
      }
      try {
        return String(left) in (right as Record<string, unknown>);
      } catch {
        return false;
      }
    }
    default: return null;
  }
}

/** Coerce to a signed 32-bit integer the way JS bitwise operators do. */
function toInt32(value: unknown): number {
  return toNumber(value) | 0;
}

/** Coerce to an unsigned 32-bit integer (for `>>>` and shift counts). */
function toUint32(value: unknown): number {
  return toNumber(value) >>> 0;
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
  // `store.method(args)` — dispatch to the store's pre-bound method (which
  // injects the handle). Methods live on `__methods`, not on the handle
  // object itself, so this lookup must precede the generic property path.
  const fn = isStoreHandle(target)
    ? target.__methods[expr.method]
    : (target as Record<string, unknown>)[expr.method];
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
    // Re-throw programming errors that authors must see (out-of-bounds
    // allocations, budget violations) instead of silently coercing them
    // to `null`.
    if (err instanceof RangeError || err instanceof RuntimeBudgetError) throw err;
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
  // Aktion's own runtime factory builtins (`$store`, `$router`, `$http`,
  // `$theme`, `$i18n`, `$emit`, `$storage(...)`) are `$`-prefixed and dispatch
  // through `evaluateInvoke`; they never reach this bare-callee path. Timers
  // (`setTimeout` / `setInterval` / …) stay bare — they are standard JS.
  //
  // Aktion 0.5 component declarations win over the legacy macro form and the
  // built-in library. This lets author code override built-in components
  // by name (e.g. wrapping `Button` with telemetry). EXCEPTION: inside the
  // declaration's own body the name resolves back to the BUILT-IN (when one
  // exists), so the wrapper pattern terminates instead of recursing — the
  // outermost call is the custom component, the innermost the library one.
  const componentDecl = ctx.componentDecls.get(callee);
  const selfShadowsBuiltin = componentDecl !== undefined && isSelfShadowingLibraryName(callee, ctx);
  if (componentDecl && !selfShadowsBuiltin) {
    return invokeComponentDecl(componentDecl, args, ctx, loc);
  }
  // Aktion 0.5 action declarations.
  //   - `save` (bare reference, e.g. `onClick: save`) returns a callable
  //     that runs the body synchronously when invoked.
  //   - `save(orderId)` (eager invocation as an expression) runs the body
  //     synchronously *now* and returns the body's last value, so authors
  //     can write `$result = greet("Ada")` and read `$result` immediately.
  // Synchronous evaluation matches every other JS-subset call shape and
  // makes actions composable with array helpers (`.map(save)`, etc.).
  const actionDecl = selfShadowsBuiltin ? undefined : ctx.actionDecls.get(callee);
  if (actionDecl) {
    const evaluated = args.map((a) => evaluate(a, ctx));
    return runActionDeclSync(actionDecl, evaluated, ctx);
  }
  // Timer builtins — `setTimeout(fn, ms)`, `setInterval(fn, ms)`,
  // `clearTimeout(id)`, `clearInterval(id)`. They mirror the host globals
  // but are routed through the context so every handle is tracked and torn
  // down on dispose (replan / disconnect). The callback fires with the
  // author's scope intact (lambdas capture `ctx`) and a `notify()` follows
  // each tick so state the callback wrote is reflected in the next render.
  // `cleanup(fn)` — register a teardown callback on the running effect.
  // Handled here (not only at the effect's statement level) so it also works
  // inside nested blocks / conditionals and when reached through the normal
  // call path, rather than being recognised solely by literal callee name
  // (feedback §2.5). No-op outside an effect run, where there is no sink.
  if (callee === "cleanup" && ctx.cleanupSink) {
    const fn = args[0] ? evaluate(args[0], ctx) : undefined;
    if (typeof fn === "function") ctx.cleanupSink(fn as () => void);
    return undefined;
  }
  if (callee === "setTimeout" || callee === "setInterval") {
    return evaluateTimerCall(callee, args, ctx);
  }
  if (callee === "clearTimeout" || callee === "clearInterval") {
    const handle = args[0] ? evaluate(args[0], ctx) : undefined;
    if (handle != null) {
      if (callee === "clearTimeout") {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
        ctx.timers.timeouts.delete(handle as ReturnType<typeof setTimeout>);
      } else {
        clearInterval(handle as ReturnType<typeof setInterval>);
        ctx.timers.intervals.delete(handle as ReturnType<typeof setInterval>);
      }
    }
    return undefined;
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
  // Callable JS globals invoked directly: `parseInt("5")`, `Number(x)`,
  // `String(x)`, `Array(3)`, `isNaN(x)`. Constructors like `Date`/`Map`
  // are also callable here (returning whatever the function form yields)
  // but are usually reached via `new` (see `evaluateNew`).
  //
  // A library component ALWAYS wins over a same-named curated global, so a
  // call to the `Map` component (`Map(lat, { lng })`) builds a component
  // node instead of invoking the `Map` *constructor* (which throws without
  // `new`). This mirrors the `!findComponent` guard on the host-global
  // passthrough below — see the §"library component still wins" note on
  // `lookupHostGlobal`.
  if (
    Object.prototype.hasOwnProperty.call(GLOBAL_NAMESPACES, callee) &&
    typeof GLOBAL_NAMESPACES[callee] === "function" &&
    !(ctx.componentDecls.has(callee)) &&
    !(ctx.library && findComponent(ctx.library, callee))
  ) {
    const fn = GLOBAL_NAMESPACES[callee] as (...a: unknown[]) => unknown;
    const evaluated: unknown[] = [];
    for (const arg of args) {
      if (arg.kind === "Spread") {
        const value = evaluate(arg.argument, ctx);
        if (Array.isArray(value)) for (const item of value) evaluated.push(item);
        continue;
      }
      evaluated.push(evaluate(arg, ctx));
    }
    try {
      return fn(...evaluated);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[aktion] global "${callee}" threw`, err);
      return null;
    }
  }

  // Final fallthrough: treat the call as a built-in component invocation
  // and build a `ComponentNode` the renderer will hand to the library. If
  // the callee resolves against *neither* the library nor any user
  // declaration we return a synthetic Skeleton node (§2 — anticipatory
  // skeletons). This handles mid-stream forward references like
  // `$app(App())` that arrive before the `function App() { ... }`
  // declaration has finished streaming: rather than dumping
  // `[unknown component: App]` into the DOM, the user sees a Skeleton
  // until the next render pass resolves the declaration.
  if (ctx.library && !findComponent(ctx.library, callee)) {
    // Full JavaScript global surface — a direct call to any host global
    // function not shadowed by a user/curated/library name: `alert("hi")`,
    // `confirm("ok?")`, `prompt("name")`, `fetch(url)`, `btoa(s)`, … Tried
    // here (after the library check) so a library component always wins.
    const hostGlobal = lookupHostGlobal(callee);
    if (hostGlobal.found && typeof hostGlobal.value === "function") {
      const fn = hostGlobal.value as (...a: unknown[]) => unknown;
      const evaluated: unknown[] = [];
      for (const arg of args) {
        if (arg.kind === "Spread") {
          const value = evaluate(arg.argument, ctx);
          if (Array.isArray(value)) for (const item of value) evaluated.push(item);
          continue;
        }
        evaluated.push(evaluate(arg, ctx));
      }
      try {
        return fn(...evaluated);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[aktion] global "${callee}" threw`, err);
        return null;
      }
    }
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
  const { args: evaluated, argMeta, universal } = resolveLibraryCallArgs(ctx, callee, propArgs);
  const node: ComponentNode = {
    __kind: "Component",
    name: callee,
    args: evaluated,
    argMeta,
    explicitKey,
    universal,
    source: loc,
  };
  return node;
}

/**
 * §19 flexible calls — build the slot-aligned `args` and
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
 *   - Extra positional args (§19 all-positional / mixed calls) — fall
 *     through to the next unfilled slot in declaration order, so
 *     `Button("Save", "primary")` binds `children` then `variant` and
 *     mixed calls fill whatever the named object left open.
 *
 * For user-declared components (no library spec) we fall back to the
 * simple "evaluate each argument as-is" path so per-instance state lookup
 * sees raw `propArgs` unchanged.
 */
function resolveLibraryCallArgs(
  ctx: EvaluationContext,
  callee: string,
  propArgs: Expression[],
): { args: unknown[]; argMeta: ArgMeta[]; universal?: Record<string, unknown> } {
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
  let universal: Record<string, unknown> | undefined;

  // Split the named-props ObjectExpr from positional args. The shared
  // `chooseNamedBagIndex` (§19 flexible calls) picks the object that plays
  // the named-props role — trailing (`Foo("hi", {x: 1})`), leading
  // (`Foo({x: 1}, [children])`), or a single all-named object
  // (`Foo({label: "hi", x: 1})`) — and leaves payload objects (an object
  // argument destined for an object-typed slot) positional.
  type PositionalSource = { expr: Expression; value: unknown };
  const positionals: PositionalSource[] = [];
  const trailingObjIdx = chooseNamedBagIndex(callArgShapes(propArgs), spec);

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
        if (slot === undefined) {
          // Universal style/behaviour channel — props every component
          // accepts (`sx`, `animate`, `id`, …). They match no declared
          // slot; collect them so the renderer can apply them to the
          // rendered element. A real slot of the same name always wins.
          if (UNIVERSAL_PROP_NAMES.has(prop.key)) {
            if (!universal) universal = {};
            universal[prop.key] = evaluate(prop.value, ctx);
          }
          continue;
        }
        const value = evaluate(prop.value, ctx);
        slots[slot]!.value = value;
        slots[slot]!.filled = true;
        const ref = stateRefForArg(prop.value, ctx);
        if (ref !== null) slots[slot]!.meta = { stateRef: ref };
      }
    }
  }

  // §19 flexible calls — positional arguments are first-class: the first
  // positional lands in the spec's positional slot; every further
  // positional fills the next unfilled slot in declaration order (so
  // all-positional calls bind props in their documented order). Named
  // entries above always win their slot; positionals only fill what is
  // left. The schema validator checks arity and literal enum values along
  // the same mapping.
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
  return { args, argMeta, universal };
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
    const objKeys: string[] = [];
    let allIdentifierKeys = true;
    for (const prop of trailingObjArg.properties) {
      if (prop.spread) continue;
      objKeys.push(prop.key);
      if (prop.key === "key" || paramNames.has(prop.key)) {
        expandAsNamed = true;
      }
      if (!/^[A-Za-z_$][\w$]*$/.test(prop.key)) allIdentifierKeys = false;
    }
    // Named slots (XIII.1): when the positional args BEFORE the trailing object
    // already satisfy every declared param, the object can't be a positional
    // param value — so treat it as named props / slots (`Panel(body, { header,
    // footer })`). Guarded to identifier keys so an opaque data payload passed
    // as the sole/only-remaining positional (`Foo({ data })`) stays positional.
    if (!expandAsNamed && allIdentifierKeys && objKeys.length > 0) {
      const positionalBefore = args.length - 1; // every arg except the trailing object
      if (positionalBefore >= decl.params.length) expandAsNamed = true;
    }
    // Strict-mode diagnostic for the silent named→positional flip (feedback
    // §2.3): the caller passed a `{...}` whose keys match NONE of the
    // component's params, so it's quietly forwarded as a positional arg. The
    // usual cause is a renamed parameter. Behaviour is unchanged; we only warn.
    if (!expandAsNamed && ctx.strict && objKeys.length > 0 && decl.params.length > 0) {
      const dedupeKey = `trailing:${decl.name}:${objKeys.slice().sort().join(",")}`;
      if (!ctx.strictWarned.has(dedupeKey)) {
        ctx.strictWarned.add(dedupeKey);
        const where = loc ? ` (line ${loc.line}, col ${loc.column})` : "";
        // eslint-disable-next-line no-console
        console.warn(
          `[aktion] strict: object { ${objKeys.join(", ")} } passed to <${decl.name}>${where} ` +
            `is being forwarded as a positional argument because none of its keys match a ` +
            `parameter (${decl.params.map((p) => p.name).join(", ") || "none"}). ` +
            `If you meant named props, check for a renamed/misspelled parameter.`,
        );
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
  const bindComponentLocal = (name: string, value: unknown) => {
    restoreLoopVars.push({
      name,
      had: ctx.loopVars.has(name),
      prev: ctx.loopVars.get(name),
    });
    ctx.loopVars.set(name, value);
  };
  for (let i = 0; i < decl.params.length; i += 1) {
    const param = decl.params[i]!;
    // Destructured param: `function Card({ title, tone = "info" })` — the
    // matching argument is a positional object/array we fan out by shape.
    if (param.pattern) {
      let source: unknown = positional[i];
      if (source === undefined && param.defaultValue) {
        source = evaluate(param.defaultValue, ctx);
      }
      for (const pair of resolvePatternBindings(param.pattern, source, ctx)) {
        bindComponentLocal(pair.name, pair.value);
      }
      continue;
    }
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
    bindComponentLocal(param.name, value);
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
  // Named slots (XIII.1): every named prop that did NOT bind to a declared
  // param is exposed two ways so authors can compose slotted layouts without
  // any special declaration syntax:
  //   1. as a `slots` object (`slots.header`, `slots.footer`), and
  //   2. as a direct binding (`header`, `footer`) when the name is a safe
  //      identifier and doesn't collide with a param.
  // This makes `Panel(body, { header: H, footer: F })` →
  // `function Panel(children) { return Column([slots.header, children, slots.footer]) }`
  // work, alongside the pre-existing `decl.slots` convention.
  const paramNames = new Set<string>();
  for (const p of decl.params) {
    if (p.name) paramNames.add(p.name);
  }
  const slotsValue: Record<string, unknown> = {};
  for (const slotName of decl.slots) {
    if (named[slotName] !== undefined) slotsValue[slotName] = named[slotName];
  }
  for (const [key, value] of Object.entries(named)) {
    if (paramNames.has(key) || value === undefined) continue;
    slotsValue[key] = value;
    // Also bind as a direct loop var when it's a safe, non-colliding name.
    if (/^[A-Za-z_$][\w$]*$/.test(key) && key !== "children" && key !== "slots" && !ctx.componentDecls.has(key)) {
      bindComponentLocal(key, value);
    }
  }
  if (Object.keys(slotsValue).length > 0 || decl.slots.length > 0) {
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
  // `$now = Util.now()` or `$n = initial` work the same way literals do.
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
  // Open a fresh hook scope for this instance. The cursor starts at 0 every
  // render so `$state` / `$memo` calls map to the same slots they did last
  // render (call-order identity — the React rules-of-hooks model). Nested
  // user-component children are produced as lazy nodes here (not expanded),
  // so they don't disturb this cursor; the renderer expands them later with
  // their own scope.
  const prevHookScope = ctx.hookScope;
  const hookScope: HookScope = { instanceKey, cursor: 0 };
  ctx.hookScope = hookScope;
  // While this body evaluates, the declaration's own name resolves to the
  // library component it shadows (if any) — wrapper semantics.
  ctx.activeComponentDecls.push(decl.name);
  try {
    const value = evaluateBlock(decl.body, ctx, { stateAsDeclaration: true });
    return { value, effects: effectsFrame, hooks: hookScope.cursor };
  } finally {
    ctx.activeComponentDecls.pop();
    ctx.hookScope = prevHookScope;
    ctx.componentEffectStack.pop();
    ctx.stateAliases.pop();
    for (const slot of restoreLoopVars) {
      if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
      else ctx.loopVars.delete(slot.name);
    }
  }
}

/**
 * Run an action body synchronously with pre-evaluated args. Binds the
 * declared parameters into `ctx.loopVars`, evaluates the body via
 * `evaluateBlock` (which honours `return`, `if`, `for`, etc.), then
 * restores the previous bindings. Returns the body's last expression
 * value (or `undefined` when the body had no `return`).
 *
 * State writes inside the body still flow through the reactive store —
 * subscribers schedule a re-render naturally — so callers don't need to
 * notify(). This makes actions safe to use as `.map(...)` callbacks
 * (the previous async wrapper notified per call, which produced an
 * infinite render loop when the result was rendered).
 */
function runActionDeclSync(
  decl: ActionDeclaration,
  args: unknown[],
  ctx: EvaluationContext,
): unknown {
  // A PascalCase component declaration mirrored into the action map keeps
  // the same wrapper semantics when its body runs as an action: a self-call
  // inside the body resolves to the shadowed built-in, not back to itself.
  const shadowsBuiltin = Boolean(
    decl.name && ctx.componentDecls.has(decl.name) && ctx.library && findComponent(ctx.library, decl.name),
  );
  if (shadowsBuiltin) ctx.activeComponentDecls.push(decl.name!);
  try {
    // Route genuine errors (not control-flow signals) through the program's
    // `$onError(fn)` hook before they propagate to the default logging.
    if (!ctx.errorHook) return runDeclBodySync(decl.params, decl.body, args, ctx);
    try {
      return runDeclBodySync(decl.params, decl.body, args, ctx);
    } catch (err) {
      if (err instanceof ReturnSignal || err instanceof BreakSignal || err instanceof ContinueSignal) throw err;
      try { ctx.errorHook({ error: err, source: decl.name ?? "action" }); } catch { /* hook must never crash the runner */ }
      throw err;
    }
  } finally {
    if (shadowsBuiltin) ctx.activeComponentDecls.pop();
  }
}

/**
 * `$optimistic(() => { … })` — run a callback that writes state optimistically
 * and automatically roll the reactive store back if it throws (or the promise
 * it returns rejects). An ordinary `$`-prefixed builtin call (valid JS), so it
 * composes anywhere an expression does:
 *
 *   onClick: () => $optimistic(() => {
 *     $todos = [...$todos, draft]            // optimistic write
 *     $save  = $http({ url: "/todos", method: "POST", body: draft })
 *     if (!draft.title) throw "title required" // → rolls $todos back
 *   })
 *
 * The whole store is snapshotted before the callback; on failure, atoms
 * created during the callback are reset and pre-existing atoms restored to
 * their snapshot value, then the error is re-thrown so callers can react.
 */
function runOptimistic(fnExpr: Expression | undefined, ctx: EvaluationContext): unknown {
  const fn = fnExpr ? evaluate(fnExpr, ctx) : undefined;
  if (typeof fn !== "function") return undefined;
  const snapshot = new Map<string, StateValue>();
  for (const [name, value] of ctx.state.entries()) snapshot.set(name, value);
  const rollback = (): void => {
    // Atoms created during the callback weren't in the snapshot — clear them.
    for (const name of [...ctx.state.entries()].map(([n]) => n)) {
      if (!snapshot.has(name)) ctx.state.set(name, undefined);
    }
    // Restore every pre-existing atom to its snapshot value.
    for (const [name, value] of snapshot) ctx.state.set(name, value);
    ctx.notify?.();
  };
  try {
    const result = (fn as () => unknown)();
    // Async callback — roll back if the returned promise rejects.
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as Promise<unknown>).catch((err: unknown) => {
        rollback();
        throw err;
      });
    }
    return result;
  } catch (err) {
    // Control-flow signals are not failures — let them propagate untouched.
    if (
      err instanceof ReturnSignal ||
      err instanceof BreakSignal ||
      err instanceof ContinueSignal
    ) {
      throw err;
    }
    rollback();
    throw err;
  }
}

/**
 * Bind `params` (with defaults / destructuring) into `ctx.loopVars`, run
 * `body` via `evaluateBlock`, then restore the previous bindings. Shared by
 * the action runner and the hook runner — the only behavioural difference
 * between an action call and a hook call is *where* the call site dispatches
 * from, not how the body executes.
 *
 * Name case does NOT decide component-vs-action semantics for state seeding:
 * when this body runs *during a render* (e.g. a lowercase `function app()`
 * invoked via `$app(page())`), its top-level `$x = expr` assignments are
 * treated as set-once declarations — exactly like a PascalCase component —
 * so the state seeds once and survives later updates instead of being
 * re-written (and clobbered) on every re-render. Outside render (event
 * handlers, value calls) the same `$x = expr` is an ordinary write.
 */
function runDeclBodySync(
  params: ReadonlyArray<{ name: string; defaultValue?: Expression; pattern?: DestructuringPattern }>,
  body: BlockExpr,
  args: unknown[],
  ctx: EvaluationContext,
): unknown {
  const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
  const bindLocal = (name: string, value: unknown) => {
    restore.push({
      name,
      had: ctx.loopVars.has(name),
      prev: ctx.loopVars.get(name),
    });
    ctx.loopVars.set(name, value);
  };
  for (let i = 0; i < params.length; i += 1) {
    const param = params[i]!;
    let value: unknown = args[i];
    if (value === undefined && param.defaultValue) {
      value = evaluate(param.defaultValue, ctx);
    }
    if (param.pattern) {
      for (const pair of resolvePatternBindings(param.pattern, value, ctx)) {
        bindLocal(pair.name, pair.value);
      }
      continue;
    }
    bindLocal(param.name, value);
  }
  try {
    return evaluateBlock(body, ctx, { stateAsDeclaration: ctx.state.isRendering() });
  } finally {
    for (const slot of restore) {
      if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
      else ctx.loopVars.delete(slot.name);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Hooks (§ Hooks) — `$state`, `$memo`, and user-declared `$useFoo(...)`.
//
// A hook is a `$`-prefixed callable that participates in the rendering
// component's per-instance slot scope. Built-in `$state` / `$memo` mirror
// React's `useState` / `useMemo`; a `function $useFoo() { ... }` declaration
// composes them. Slots are matched by call order across renders (the React
// rules of hooks): call hooks unconditionally, in a stable order, at the top
// level of a component / hook body.
// ──────────────────────────────────────────────────────────────────────

/**
 * Get the ordered hook-cell array for the rendering instance, creating it on
 * first use. Returns `null` when called outside any component render (no
 * active hook scope) so callers can degrade gracefully.
 */
function instanceHookCells(ctx: EvaluationContext): HookCell[] | null {
  const scope = ctx.hookScope;
  if (!scope) return null;
  let cells = ctx.hookStore.get(scope.instanceKey);
  if (!cells) {
    cells = [];
    ctx.hookStore.set(scope.instanceKey, cells);
  }
  return cells;
}

/** Shallow `Object.is` comparison of two dependency arrays (React semantics). */
function depsEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * `$state(initial)` — React's `useState`. Returns a `[value, setValue]` pair.
 * The initializer is evaluated once, on the render that first reaches this
 * slot; later renders return the stored value (so user mutations persist).
 * `setValue(next)` accepts a replacement value or an updater function
 * (`setValue(prev => prev + 1)`); it no-ops when the value is unchanged
 * (`Object.is`) and otherwise schedules a re-render via `ctx.notify()`.
 */
function evaluateStateHook(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const cells = instanceHookCells(ctx);
  if (!cells) {
    // Outside a component — degrade to a one-shot value with an inert setter
    // so a stray top-level `$state(...)` doesn't crash the render.
    warnHookOutsideComponent("state", loc);
    const initial = args[0] ? evaluate(args[0], ctx) : undefined;
    return [initial, () => {}];
  }
  const slot = ctx.hookScope!.cursor++;
  let cell = cells[slot];
  if (!cell || cell.kind !== "state") {
    const initial = args[0] ? evaluate(args[0], ctx) : undefined;
    cell = { kind: "state", value: initial };
    cells[slot] = cell;
  }
  const stateCell = cell;
  const setValue = (next: unknown): void => {
    const resolved = typeof next === "function"
      ? (next as (prev: unknown) => unknown)(stateCell.value)
      : next;
    if (Object.is(resolved, stateCell.value)) return;
    stateCell.value = resolved;
    ctx.notify?.();
  };
  return [stateCell.value, setValue];
}

/**
 * `$memo(() => compute, [deps])` — React's `useMemo`. Recomputes `fn()` only
 * when a dependency changes (shallow `Object.is` compare); otherwise returns
 * the cached value. With no deps array it recomputes every render (matching
 * React). `fn` may also be a plain function reference or a bare value.
 */
function evaluateMemoHook(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const fnExpr = args[0];
  const depsExpr = args[1];
  const compute = (): unknown => {
    const fn = fnExpr ? evaluate(fnExpr, ctx) : undefined;
    return typeof fn === "function" ? (fn as () => unknown)() : fn;
  };
  const cells = instanceHookCells(ctx);
  if (!cells) {
    warnHookOutsideComponent("memo", loc);
    return compute();
  }
  const slot = ctx.hookScope!.cursor++;
  const deps = depsExpr ? evaluate(depsExpr, ctx) : undefined;
  const depsArr = Array.isArray(deps) ? (deps as ReadonlyArray<unknown>) : undefined;
  const prev = cells[slot];
  if (
    prev && prev.kind === "memo" &&
    depsArr && prev.deps && depsEqual(prev.deps, depsArr)
  ) {
    return prev.value;
  }
  const value = compute();
  cells[slot] = { kind: "memo", deps: depsArr, value };
  return value;
}

/**
 * `$ref(initial)` — React's `useRef`. Returns a stable mutable box
 * `{ current }` whose identity persists across renders. Writing
 * `ref.current = …` does NOT schedule a re-render (the escape hatch for
 * holding a DOM node, a previous value, a timer id, or any mutable value
 * that should survive renders without driving the UI). Pair it with the
 * `OnMount(child, { onMount: node => ref.current = node })` wrapper to grab
 * a rendered DOM node.
 */
function evaluateRefHook(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const cells = instanceHookCells(ctx);
  if (!cells) {
    warnHookOutsideComponent("ref", loc);
    return { current: args[0] ? evaluate(args[0], ctx) : undefined };
  }
  const slot = ctx.hookScope!.cursor++;
  let cell = cells[slot];
  if (!cell || cell.kind !== "ref") {
    cell = { kind: "ref", box: { current: args[0] ? evaluate(args[0], ctx) : undefined } };
    cells[slot] = cell;
  }
  return cell.box;
}

/**
 * `$reducer(reducer, initial)` — React's `useReducer`. Returns a
 * `[state, dispatch]` pair. `dispatch(action)` computes
 * `reducer(state, action)` and schedules a re-render when the result
 * differs (`Object.is`). The reducer is a pure `(state, action) => next`
 * callable — the idiomatic way to manage state with many related
 * transitions without juggling several `$state` setters.
 */
function evaluateReducerHook(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const reducer = args[0] ? evaluate(args[0], ctx) : undefined;
  const cells = instanceHookCells(ctx);
  const initial = args[1] ? evaluate(args[1], ctx) : undefined;
  if (!cells) {
    warnHookOutsideComponent("reducer", loc);
    return [initial, () => {}];
  }
  const slot = ctx.hookScope!.cursor++;
  let cell = cells[slot];
  if (!cell || cell.kind !== "reducer") {
    cell = { kind: "reducer", value: initial };
    cells[slot] = cell;
  }
  const reducerCell = cell;
  const dispatch = (action: unknown): void => {
    if (typeof reducer !== "function") return;
    const next = (reducer as (s: unknown, a: unknown) => unknown)(reducerCell.value, action);
    if (Object.is(next, reducerCell.value)) return;
    reducerCell.value = next;
    ctx.notify?.();
  };
  return [reducerCell.value, dispatch];
}

let idHookCounter = 0;
/**
 * `$id(prefix?)` — React's `useId`. Returns a stable, unique string id for
 * the lifetime of the component instance (the same value on every render),
 * for wiring `for`/`id`/`aria-labelledby` pairs without hard-coding ids that
 * collide when a component is rendered more than once.
 */
function evaluateIdHook(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const prefix = args[0] ? String(evaluate(args[0], ctx)) : "rui";
  const cells = instanceHookCells(ctx);
  if (!cells) {
    warnHookOutsideComponent("id", loc);
    return `${prefix}-${(idHookCounter += 1)}`;
  }
  const slot = ctx.hookScope!.cursor++;
  let cell = cells[slot];
  if (!cell || cell.kind !== "id") {
    cell = { kind: "id", value: `${prefix}-${(idHookCounter += 1)}` };
    cells[slot] = cell;
  }
  return cell.value;
}

/**
 * Invoke a user hook (`$useFoo(...)`). The body runs inline in the CURRENT
 * hook scope (no new instance scope is opened), so `$state` / `$memo` calls
 * inside it allocate slots on the rendering component — exactly how a React
 * custom hook shares its caller's slots.
 */
function invokeHookDecl(
  decl: HookDeclaration,
  argExprs: Expression[],
  ctx: EvaluationContext,
): unknown {
  const args: unknown[] = [];
  for (const arg of argExprs) {
    if (arg.kind === "Spread") {
      const value = evaluate(arg.argument, ctx);
      if (Array.isArray(value)) for (const item of value) args.push(item);
      continue;
    }
    args.push(evaluate(arg, ctx));
  }
  return runDeclBodySync(decl.params, decl.body, args, ctx);
}

let warnedHookOutsideComponent = false;
function warnHookOutsideComponent(
  hookName: string,
  loc?: { line: number; column: number },
): void {
  // Throttle to one warning per program so a top-level mistake doesn't spam
  // the console on every render.
  if (warnedHookOutsideComponent) return;
  warnedHookOutsideComponent = true;
  // eslint-disable-next-line no-console
  console.error(
    `[aktion] $${hookName}(...) was called outside a component render. ` +
      `Hooks may only be called at the top level of a component body or another $hook.`,
    loc,
  );
}

/**
 * Drop every hook cell owned by `instanceKey`. Called by the renderer when a
 * component instance leaves the tree so its `$state` resets to the initial
 * value on a future remount (React-like reset-on-unmount).
 */
export function clearInstanceHooks(ctx: EvaluationContext, instanceKey: string): void {
  ctx.hookStore.delete(instanceKey);
}

/**
 * Build a synchronous callable for an action declaration. The returned
 * function captures the surrounding `loopVars` and per-instance state
 * aliases so the body resolves correctly when the callable runs later
 * (e.g. on click, or from a `.map(...)` callback).
 *
 * The callable is synchronous: it runs the body inline and returns the
 * value (matching the JS subset's ordinary call shape). State writes
 * fire reactive subscribers — `notify()` is *not* called per call so
 * passing an action as a `.map(...)` callback never produces a render
 * loop.
 */
function makeSyncActionCallable(decl: ActionDeclaration, ctx: EvaluationContext) {
  const capturedAliases: Array<Map<string, string>> = ctx.stateAliases.map(
    (frame) => new Map(frame),
  );
  const capturedLoopVars = new Map(ctx.loopVars);
  return (...args: unknown[]) => {
    const restoreLoopVars = new Map(ctx.loopVars);
    const restoreAliases = ctx.stateAliases.slice();
    ctx.loopVars.clear();
    for (const [k, v] of capturedLoopVars) ctx.loopVars.set(k, v);
    ctx.stateAliases.length = 0;
    for (const frame of capturedAliases) ctx.stateAliases.push(frame);
    try {
      return runActionDeclSync(decl, args, ctx);
    } finally {
      ctx.loopVars.clear();
      for (const [k, v] of restoreLoopVars) ctx.loopVars.set(k, v);
      ctx.stateAliases.length = 0;
      for (const frame of restoreAliases) ctx.stateAliases.push(frame);
    }
  };
}

/**
 * Build a synchronous callable for a user component declaration. Used
 * when a PascalCase component is referenced by name — typically as the
 * callback to an array helper like `fruits.map(Fruit)` — so the result
 * is an array of `UserComponent` nodes the renderer can materialise.
 *
 * `Array.prototype.map` calls the callback with `(item, index, array)`;
 * extra arguments past the component's declared params land in the
 * implicit `children` slot, exactly as they would for a direct call.
 */
function makeUserComponentCallable(decl: ComponentDeclaration, _ctx: EvaluationContext) {
  return (...args: unknown[]): UserComponentNode => ({
    __kind: "UserComponent",
    decl,
    positional: args,
    named: {},
    explicitKey: undefined,
    source: decl.loc,
  });
}

/**
 * Build a synchronous callable for a built-in library component
 * referenced by name (`fruits.map(Badge)`, `fruits.map(Text)`). Wraps
 * each call in a `ComponentNode` of the same shape `evaluateLibraryCall`
 * produces, so the renderer can resolve and render the spec directly.
 */
function makeLibraryComponentCallable(name: string, _ctx: EvaluationContext) {
  return (...args: unknown[]): ComponentNode => ({
    __kind: "Component",
    name,
    args,
    argMeta: args.map(() => ({})),
    source: undefined,
  });
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
  if (name === "__rui_prefix__") {
    return evaluateSyntheticPrefix(args, ctx);
  }
  // `await expr` in expression position. The surrounding action / effect
  // runner already awaits thenables produced by an assignment / await
  // statement, so this expression is a structural marker that yields the
  // argument unchanged. (No event loop is available inside `evaluate`.)
  if (name === "__rui_await__") {
    return args[0] ? evaluate(args[0], ctx) : undefined;
  }

  // Any other builtin name is unknown: the former `@`-builtin catalog was
  // removed in favour of native JS / the `Util` namespace, so there is no
  // registry left to look up.
  return null;
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
    case "%=": {
      const divisor = toNumber(next);
      return divisor === 0 ? 0 : toNumber(current) % divisor;
    }
    case "**=": return toNumber(current) ** toNumber(next);
    // Logical-assignment — short-circuit on the CURRENT value, matching
    // JS semantics (`a ||= b` only assigns when `a` is falsy, etc.).
    case "&&=": return current ? next : current;
    case "||=": return current ? current : next;
    case "??=": return current == null ? next : current;
    // Bitwise / shift compound assignment.
    case "&=": return toInt32(current) & toInt32(next);
    case "|=": return toInt32(current) | toInt32(next);
    case "^=": return toInt32(current) ^ toInt32(next);
    case "<<=": return toInt32(current) << (toUint32(next) & 31);
    case ">>=": return toInt32(current) >> (toUint32(next) & 31);
    case ">>>=": return toUint32(current) >>> (toUint32(next) & 31);
    default: return next;
  }
}

/**
 * Evaluate a `setTimeout(fn, ms, ...args)` / `setInterval(fn, ms, ...args)`
 * call. The first argument must evaluate to a function (typically a lambda
 * or a bare action reference); a non-callable first argument is a no-op
 * that returns `null`. The returned handle is registered on the context so
 * it is cleared on dispose and can be passed to `clearTimeout` /
 * `clearInterval`. Each tick runs the callback then calls `notify()` so
 * any state it wrote is rendered (matching `effect(..., [on:every(N)])`).
 */
function evaluateTimerCall(
  callee: "setTimeout" | "setInterval",
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  const callback = args[0] ? evaluate(args[0], ctx) : null;
  if (typeof callback !== "function") return null;
  const fn = callback as (...a: unknown[]) => unknown;
  const delay = args[1] ? toNumber(evaluate(args[1], ctx)) : 0;
  const extra: unknown[] = [];
  for (let i = 2; i < args.length; i += 1) {
    extra.push(evaluate(args[i]!, ctx));
  }

  const tick = (): void => {
    try {
      fn(...extra);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[aktion] ${callee} callback threw`, err);
    } finally {
      ctx.notify?.();
    }
  };

  if (callee === "setTimeout") {
    const id = setTimeout(() => {
      // A one-shot timer is done once it fires — drop it from the registry
      // before running so a slow callback can't leave a dead handle behind.
      ctx.timers.timeouts.delete(id);
      tick();
    }, delay);
    ctx.timers.timeouts.add(id);
    return id;
  }
  const id = setInterval(tick, delay);
  ctx.timers.intervals.add(id);
  return id;
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
      const rootValue = ctx.state.get(extracted.name);
      // Live `Http({...})` resource bags are mutated in place — they hold
      // async continuations that close over the original object, so the
      // immutable `{...prev}` clone `setPath` performs would detach the
      // in-flight request from the value the program reads (and `onDone`
      // would never see the assignment). Write straight onto the bag and
      // notify instead. Reads stay correct because it's the same reference.
      if (extracted.path.length >= 1 && isEndpointResource(rootValue)) {
        let parent: unknown = rootValue;
        for (let i = 0; i < extracted.path.length - 1; i += 1) {
          parent = (parent as Record<string, unknown> | null | undefined)?.[extracted.path[i]!];
        }
        if (parent && typeof parent === "object") {
          const key = extracted.path[extracted.path.length - 1]!;
          const current = (parent as Record<string, unknown>)[key];
          const next = applyAssignOp(op, current, rhs);
          (parent as Record<string, unknown>)[key] = next;
          ctx.notify?.();
          return next;
        }
      }
      const current = readAtPath(rootValue, extracted.path);
      const next = applyAssignOp(op, current, rhs);
      ctx.state.setPath(extracted.name, extracted.path, next);
      return next;
    }
    // `s.field = value` inside a store method (or `cart.field = …` directly):
    // route through the store's backing atom so the write is reactive.
    const storePath = extractStorePath(targetExpr, ctx);
    if (storePath) {
      const current = readAtPath(ctx.state.get(storePath.atom), storePath.path);
      const next = applyAssignOp(op, current, rhs);
      ctx.state.setPath(storePath.atom, storePath.path, next);
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
    const name = targetExpr.name;
    // A real local / param / loop variable always wins — keep block-local
    // assignments (`for (let j = …) j--`) in `loopVars`.
    if (ctx.loopVars.has(name)) {
      const current = ctx.loopVars.get(name);
      const next = applyAssignOp(op, current, rhs);
      ctx.loopVars.set(name, next);
      return next;
    }
    // Otherwise route to the per-render mutable-binding slot so writes to
    // top-level `let`/`var`/plain variables (`badges = [...badges, …]`,
    // `i = i - 1`) persist for the rest of the render instead of leaking
    // into `loopVars` (where they accumulated across renders).
    if (ctx.bindings.has(name) || ctx.mutableBindings.has(name)) {
      const current = ctx.mutableBindings.has(name)
        ? ctx.mutableBindings.get(name)
        : (ctx.bindings.get(name)!)();
      const next = applyAssignOp(op, current, rhs);
      ctx.mutableBindings.set(name, next);
      return next;
    }
    // Truly undeclared identifier — fall back to a loop-var slot so the
    // value is at least observable to later reads in this scope.
    const current = ctx.loopVars.get(name);
    const next = applyAssignOp(op, current, rhs);
    ctx.loopVars.set(name, next);
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
 * Evaluate a `__rui_postfix__(target, op)` or `__rui_prefix__(target, op)`
 * synthetic call. Postfix (`x++`, `x--`) returns the OLD value to match
 * JavaScript semantics; prefix (`++x`, `--x`) returns the NEW value.
 */
function applyIncrement(
  args: Expression[],
  ctx: EvaluationContext,
  mode: "prefix" | "postfix",
): unknown {
  const [targetExpr, opExpr] = args;
  if (!targetExpr) return null;
  const op = opExpr && opExpr.kind === "Literal" ? String(opExpr.value ?? "++") : "++";
  const delta = op === "--" ? -1 : 1;
  if (targetExpr.kind === "StateRef") {
    const target = resolveStateAlias(ctx, targetExpr.name);
    const current = toNumber(ctx.state.get(target));
    const next = current + delta;
    ctx.state.set(target, next);
    return mode === "prefix" ? next : current;
  }
  if (targetExpr.kind === "Member") {
    const extracted = extractStatePath(targetExpr, ctx);
    if (extracted) {
      const current = toNumber(readAtPath(ctx.state.get(extracted.name), extracted.path));
      const next = current + delta;
      ctx.state.setPath(extracted.name, extracted.path, next);
      return mode === "prefix" ? next : current;
    }
  }
  if (targetExpr.kind === "Identifier") {
    const name = targetExpr.name;
    if (ctx.loopVars.has(name)) {
      const current = toNumber(ctx.loopVars.get(name));
      const next = current + delta;
      ctx.loopVars.set(name, next);
      return mode === "prefix" ? next : current;
    }
    // Top-level mutable variable (`count++` against `count = 0`).
    if (ctx.bindings.has(name) || ctx.mutableBindings.has(name)) {
      const current = toNumber(
        ctx.mutableBindings.has(name)
          ? ctx.mutableBindings.get(name)
          : (ctx.bindings.get(name)!)(),
      );
      const next = current + delta;
      ctx.mutableBindings.set(name, next);
      return mode === "prefix" ? next : current;
    }
    const current = toNumber(ctx.loopVars.get(name));
    const next = current + delta;
    ctx.loopVars.set(name, next);
    return mode === "prefix" ? next : current;
  }
  return null;
}

function evaluateSyntheticPostfix(
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  return applyIncrement(args, ctx, "postfix");
}

function evaluateSyntheticPrefix(
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  return applyIncrement(args, ctx, "prefix");
}

/**
 * Resolve the current route path. Prefers the router (when present), falls
 * back to the `route` state slot, and finally to "/". Tracking the slot
 * here makes router bindings reactive to host pages that write the path
 * imperatively (e.g. for SSR-style hydration).
 */
function readRoutePath(ctx: EvaluationContext): string {
  // Subscribe the current render to the `route` state slot — ALWAYS, even
  // when a live `router` is present. The host writes this slot on every
  // route change (`writeRouteState` in element.ts), and per-component
  // memoisation re-runs a body only when a changed path overlaps the paths
  // it read last render. Without this, a `$router({...})` component records
  // no `route` dependency, so an in-app `navigate(...)` / hash change is
  // memoised away and the page only updates on a full reload (where the
  // first paint renders ungated). Mirrors the bare `route` identifier read.
  ctx.trackedState.add("route");
  if (ctx.router) {
    return ctx.router.getPath();
  }
  if (ctx.state.has("route")) {
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
 * §19 flexible calls — see `resolveLibraryCallArgs` /
 * `chooseNamedBagIndex`. A single object argument whose keys match the
 * spec's prop names IS the named-props object (`Stack({ gap: "md" })` ≡
 * `Stack([], { gap: "md" })`); an object whose keys match nothing binds
 * positionally when the target slot accepts an object payload.
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
 *   `$theme({ name, colors: {...}, radius: {...}, font: {...}, direction })`
 *
 * Groups flatten with a stable naming convention:
 *   `colors.primary`     → `colorPrimary`
 *   `radius.md`          → `radiusMd`
 *   `font.family`        → `fontFamily`
 *
 * Top-level metadata keys (`name`, `direction`) are accepted but never
 * emitted as CSS variables. The legacy flat-shape form
 * (`$theme({colorPrimary: "...", ...})`) and free-form CSS variable
 * keys (`$theme({"--color-x": "..."})`) were removed in SUIS/2: the
 * runtime ignores unknown top-level keys silently to keep streaming
 * partial themes safe, but the schema validator surfaces them as
 * advisory warnings (§15) so authors can migrate.
 */
const STRUCTURED_THEME_GROUPS = new Set([
  "colors",
  "radius",
  "font",
  "fonts",
  "spacing",
  "shadows",
  "gradients",
  "zIndex",
  "motion",
]);
const THEME_METADATA_KEYS = new Set(["name", "direction"]);

/** Canonical spacing keys → the flat-token spelling used by ThemeTokens. */
const SPACING_THEME_KEY_ALIASES: Record<string, string> = {
  sm: "s",
  md: "m",
  lg: "l",
};

/** Group name → flat-token prefix (e.g. `shadows.md` → `shadowMd`). */
const THEME_GROUP_PREFIX: Record<string, string> = {
  colors: "color",
  radius: "radius",
  font: "font",
  spacing: "spacing",
  shadows: "shadow",
  gradients: "gradient",
  zIndex: "z",
  motion: "motion",
};

/**
 * Read the `name` metadata key off a `$theme({...})` config and return the
 * matching built-in theme key (`dark`, `neon`, `pastel`, `glass`,
 * `brutalist`, `skyline`, ...) when it names a real registered theme.
 * Returns `null` for an absent / unknown name so the runtime falls back to
 * the active base theme rather than wiping it.
 */
function resolveBuiltInThemeName(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as Record<string, unknown>).name;
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase();
  return key in builtInThemes ? key : null;
}

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
      const prefix = THEME_GROUP_PREFIX[key] ?? key;
      const isGradient = key === "gradients";
      for (const [innerKey, innerValue] of Object.entries(raw as Record<string, unknown>)) {
        if (innerValue == null) continue;
        // The spacing scale advertises canonical t-shirt names (sm/md/lg) but
        // stores them in the historical short tokens (spacingS/M/L), so both
        // spellings override the same CSS variable.
        const normalisedKey = key === "spacing"
          ? (SPACING_THEME_KEY_ALIASES[innerKey] ?? innerKey)
          : innerKey;
        const flatKey = prefix + capitalise(normalisedKey);
        const str = isGradient ? gradientToCss(innerValue) : stringifyTokenValue(innerValue);
        if (str) out[flatKey] = str;
      }
    }
  }
  return out;
}

/**
 * Convert a gradient token value into a safe CSS `linear-gradient(...)`.
 * Accepts: an array of colors (`["#6366f1", "#ec4899"]`), an object
 * `{ stops: [...], angle?: number }`, or a raw gradient/color string.
 * Color stops are validated; anything unsafe collapses the gradient to "".
 */
function gradientToCss(value: unknown): string {
  const colorOk = (c: unknown): string => {
    const s = typeof c === "string" ? c.trim() : "";
    if (!s || s.length > 64) return "";
    // hex / rgb / hsl / named — no separators that break out of the function
    if (!/^[a-zA-Z0-9#%.,()\s+-]+$/.test(s)) return "";
    if (/url\s*\(|expression\s*\(|javascript\s*:|@import/i.test(s)) return "";
    return s;
  };
  if (Array.isArray(value)) {
    const stops = value.map(colorOk).filter(Boolean);
    if (stops.length < 2) return "";
    return `linear-gradient(120deg, ${stops.join(", ")})`;
  }
  if (value && typeof value === "object") {
    const o = value as { stops?: unknown; angle?: unknown };
    const stops = Array.isArray(o.stops) ? o.stops.map(colorOk).filter(Boolean) : [];
    if (stops.length < 2) return "";
    const angle = typeof o.angle === "number" && Number.isFinite(o.angle) ? `${Math.round(o.angle)}deg` : "120deg";
    return `linear-gradient(${angle}, ${stops.join(", ")})`;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^(linear|radial|conic)-gradient\(/.test(s) && !/expression\s*\(|javascript\s*:|@import|<\/?\w/i.test(s) && s.length <= 256) {
      return s;
    }
  }
  return "";
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
