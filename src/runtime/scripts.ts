/**
 * JavaScript interactions runtime.
 *
 * Powers two language features that are always available on
 * `<streaming-ui-script>`:
 *
 *   1. `Script("id", "body", deps?)` — behaviour-only component whose JS body
 *      runs after the next render. The body receives a `ctx` object exposing
 *      reactive state, registered tools, DOM refs, and lifecycle hooks. The
 *      reconciliation rules mirror `useEffect`: re-run when deps change,
 *      clean up before re-running, dispose on unmount.
 *
 *   2. `@Js("code")` — action step that runs JS imperatively (e.g. from a
 *      button click). It shares the same `ctx` surface, plus an `args` array
 *      forwarded from the click handler when relevant.
 *
 * The runner is intentionally a small bridge: it never compiles JS itself
 * (we use `new Function`), it does not redefine globals, and it never runs a
 * script while the response is still streaming (mid-stream chunks are almost
 * always incomplete, so JS that fires there would observe a broken UI).
 */

import type { StateStore } from "./state.js";
import type { QueryRegistry, ToolHandler } from "./queries.js";

export interface ScriptRunnerOptions {
  /** State store backing `ctx.state`. */
  state: StateStore;
  /** Query registry backing `ctx.tools.<name>(args)`. */
  queries: QueryRegistry;
  /** Shadow root used by `ctx.query` / `ctx.queryAll`. */
  getRoot: () => ShadowRoot | null;
  /** Host element exposed as `ctx.host`. */
  getHost: () => HTMLElement | null;
  /** Forwarded to `ctx.dispatch(message)`. */
  onAssistantMessage?: (message: string) => void;
  /** Override how URLs open (defaults to `window.open`). */
  onOpenUrl?: (url: string) => void;
}

/** Public surface exposed to user-supplied scripts. Kept small on purpose. */
export interface ScriptContext {
  /** Reactive state proxy. */
  readonly state: ScriptStateApi;
  /** Async tool invocations registered via `setTools`. */
  readonly tools: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>;
  /**
   * Render-time arguments captured by `@Js(body, args)`. Always present
   * (defaults to `{}`) so handlers can safely read `ctx.args.id` without
   * guarding. Empty for `Script(...)` bodies.
   */
  readonly args: Record<string, unknown>;
  /** Send a message back to the host as an `assistant-message` event. */
  dispatch(message: string): void;
  /** Open a URL via the configured opener (falls back to `window.open`). */
  open(url: string): void;
  /** `host.shadowRoot.getElementById` for the named DOM id (`Input("id", ...)`). */
  query(id: string): HTMLElement | null;
  /** `host.shadowRoot.querySelectorAll` returning a live-ish array. */
  queryAll(selector: string): HTMLElement[];
  /** Host element (the `<streaming-ui-script>` tag). */
  readonly host: HTMLElement | null;
  /** Register a cleanup callback that runs before the next re-run or unmount. */
  cleanup(fn: () => void): void;
  /** AbortSignal that fires when the script is about to re-run or unmount. */
  readonly signal: AbortSignal;
}

export interface ScriptStateApi {
  get<T = unknown>(name: string): T | undefined;
  set(name: string, value: unknown): void;
  reset(...names: string[]): void;
  /** Snapshot of every state value at call time. */
  values(): Record<string, unknown>;
}

export interface ScriptDeclaration {
  id: string;
  body: string;
  /** Names of `$variables` whose changes should re-run the script. */
  deps?: ReadonlyArray<string>;
}

interface ScriptInstance {
  body: string;
  deps: string[] | null;
  lastDepsKey: string;
  cleanups: Array<() => void>;
  abort: AbortController;
  /** True once the script has run at least once with the current `body`. */
  initialised: boolean;
}

/**
 * Reconciles Script(...) declarations across renders.
 *
 * Lifecycle:
 *   - `beginCycle()` is called at the start of a render.
 *   - `declare(...)` is called by the Script render function as the renderer
 *     walks the tree.
 *   - `flush()` runs newly-mounted / changed scripts and disposes scripts
 *     that no longer appear in the tree. It is a no-op while the host is
 *     streaming (in-flight chunks may be incomplete bodies).
 *   - `reset()` tears everything down (called when the program text changes).
 */
export class ScriptRunner {
  private readonly options: ScriptRunnerOptions;
  private readonly instances = new Map<string, ScriptInstance>();
  private pending = new Map<string, ScriptDeclaration>();
  private streaming = false;

  constructor(options: ScriptRunnerOptions) {
    this.options = options;
  }

  setStreaming(streaming: boolean): void {
    this.streaming = streaming;
  }

  /** Called by the renderer before walking the tree for a new render pass. */
  beginCycle(): void {
    this.pending = new Map();
  }

  declare(declaration: ScriptDeclaration): void {
    if (!declaration.id) return;
    this.pending.set(declaration.id, declaration);
  }

  /**
   * Apply the declarations collected during the latest render: run new ones,
   * re-run changed ones, and dispose removed ones. Safe to call repeatedly.
   */
  flush(): void {
    // While the response is still streaming, partial chunks routinely omit
    // a Script's declaration before the next chunk lands. Skip the entire
    // reconciliation pass so mid-stream chunks don't tear down live
    // listeners / timers only to recreate them milliseconds later.
    if (this.streaming) return;

    // Dispose scripts that vanished from the tree.
    for (const [id, inst] of this.instances) {
      if (!this.pending.has(id)) {
        this.disposeInstance(inst);
        this.instances.delete(id);
      }
    }

    for (const [id, declaration] of this.pending) {
      const existing = this.instances.get(id);
      const deps = normaliseDeps(declaration.deps);
      const depsKey = depsKeyFor(deps, this.options.state);

      if (!existing) {
        const instance = this.createInstance(declaration.body, deps, depsKey);
        this.instances.set(id, instance);
        this.runInstance(instance);
        continue;
      }

      const bodyChanged = existing.body !== declaration.body;
      const depsChanged = existing.lastDepsKey !== depsKey;
      if (!bodyChanged && !depsChanged && existing.initialised) continue;

      this.disposeInstance(existing);
      existing.body = declaration.body;
      existing.deps = deps;
      existing.lastDepsKey = depsKey;
      existing.abort = new AbortController();
      existing.cleanups = [];
      existing.initialised = false;
      this.runInstance(existing);
    }
  }

  reset(): void {
    for (const inst of this.instances.values()) this.disposeInstance(inst);
    this.instances.clear();
    this.pending = new Map();
  }

  /**
   * Run an inline `@Js("code")` action step. Errors are logged but never
   * thrown — actions chain through buttons and we don't want a single bad
   * step to break the whole action.
   */
  runInline(code: string, args: Record<string, unknown> = {}): void {
    const trimmed = (code ?? "").trim();
    if (!trimmed) return;
    const abort = new AbortController();
    const ctx = this.buildContext(abort.signal, () => abort.abort(), args);
    void invokeScriptBody(trimmed, ctx, "@Js");
  }

  // ----- Internal -----

  private createInstance(body: string, deps: string[] | null, depsKey: string): ScriptInstance {
    return {
      body,
      deps,
      lastDepsKey: depsKey,
      cleanups: [],
      abort: new AbortController(),
      initialised: false,
    };
  }

  private runInstance(inst: ScriptInstance): void {
    const ctx = this.buildContext(inst.abort.signal, (fn) => inst.cleanups.push(fn), {});
    void invokeScriptBody(inst.body, ctx, "Script");
    inst.initialised = true;
  }

  private disposeInstance(inst: ScriptInstance): void {
    inst.abort.abort();
    for (const cleanup of inst.cleanups) {
      try {
        cleanup();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[streaming-ui-script] Script cleanup failed", err);
      }
    }
    inst.cleanups = [];
  }

  private buildContext(
    signal: AbortSignal,
    registerCleanup: (fn: () => void) => void,
    args: Record<string, unknown>,
  ): ScriptContext {
    const opts = this.options;
    const stateApi: ScriptStateApi = {
      get: <T,>(name: string) => opts.state.get(name) as T | undefined,
      set: (name, value) => opts.state.set(name, value),
      reset: (...names) => opts.state.reset(...names),
      values: () => snapshotState(opts.state),
    };

    const tools = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (typeof prop !== "string") return undefined;
          return (args?: Record<string, unknown>) => opts.queries.callTool(prop, args ?? {});
        },
      },
    ) as ScriptContext["tools"];

    const ctx: ScriptContext = {
      state: stateApi,
      tools,
      args,
      dispatch: (message: string) => opts.onAssistantMessage?.(message),
      open: (url: string) => {
        if (opts.onOpenUrl) opts.onOpenUrl(url);
        else if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
      },
      query: (id: string) => {
        const root = opts.getRoot();
        return root ? (root.getElementById(id) as HTMLElement | null) : null;
      },
      queryAll: (selector: string) => {
        const root = opts.getRoot();
        if (!root) return [];
        return Array.from(root.querySelectorAll(selector)) as HTMLElement[];
      },
      host: opts.getHost(),
      cleanup: registerCleanup,
      signal,
    };
    return ctx;
  }
}

/**
 * Compile the user body as an async function so it can use `await` at the
 * top level — the LLM almost always reaches for `await ctx.tools.foo(...)`.
 * Errors (both compile-time and runtime) are reported to the console so a
 * broken script never crashes the host page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AsyncFunctionCtor: any = Object.getPrototypeOf(async function () {}).constructor;

async function invokeScriptBody(body: string, ctx: ScriptContext, label: string): Promise<void> {
  try {
    const fn = new AsyncFunctionCtor("ctx", `"use strict";\n${body}`);
    await fn.call(null, ctx);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[streaming-ui-script] ${label} execution failed`, err);
  }
}

function normaliseDeps(deps: unknown): string[] | null {
  if (deps === undefined || deps === null) return null;
  if (!Array.isArray(deps)) return [];
  const out: string[] = [];
  for (const dep of deps) {
    if (typeof dep === "string" && dep.trim()) out.push(dep.trim());
  }
  return out;
}

function depsKeyFor(deps: string[] | null, state: StateStore): string {
  if (!deps) return "__mount_only__";
  if (deps.length === 0) return "__empty__";
  const parts = deps.map((name) => `${name}=${stringify(state.get(name))}`);
  return parts.join("|");
}

function snapshotState(state: StateStore): Record<string, unknown> {
  return state.snapshot();
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type { ToolHandler };
