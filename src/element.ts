/**
 * `<aktion-app>` custom element.
 *
 * Public surface:
 *   - Attributes:
 *       `theme`                  — "light" | "dark" | JSON token map
 *       `streaming`              — "true" while text is still arriving from the LLM
 *       `response`               — Aktion program (string)
 *       `showerrors`             — "true" to render parse errors in the UI
 *                                  (defaults to off; the `error` event still fires)
 *   - Properties:
 *       `response: string`       — current Aktion text
 *       `streaming: boolean`     — reflects the `streaming` attribute
 *       `showErrors: boolean`    — reflects the `showerrors` attribute
 *   - Methods:
 *       `setResponse(text)`              — replace the current program
 *       `appendChunk(text)`              — append a streaming chunk and re-render
 *       `setTheme(theme)`                — apply a theme by name or token map
 *       `registerComponents(...)`        — extend the built-in library
 *       `registerHttpInterceptors(...)`  — install `onRequest`/`onResponse`/`onError`
 *                                          hooks for the Aktion HTTP layer
 *       `getSystemPrompt(opts)`          — build a system prompt for the current library
 *       `clear()`                        — reset state and clear the rendered output
 *
 * Events:
 *   - `assistant-message` — fired when an action handler calls
 *     `helpers.sendToAssistant("...")`. `event.detail.message` carries the text.
 *   - `error`             — fired with `event.detail.errors` for parse failures.
 *   - `route-change`      — fired when the active hash route changes.
 *   - Custom events emitted via `emit "name" { detail }` inside
 *     `effect` / `action` bodies dispatch with the provided name and detail.
 */

import { parse } from "./parser/index.js";
import { applyDelta, type DeltaOp } from "./tooling/index.js";
import {
  StateStore,
  Router,
  createContext,
  createLocalStorageAdapter,
  disposeContext,
  planProgram,
  isThemeNode,
  type RouteChangeDetail,
} from "./runtime/index.js";
import { HttpRuntime } from "./runtime/http.js";
import { I18nRuntime } from "./runtime/i18n.js";
import { EffectRunner, ActionDeclRunner, createInlineJsExecutor } from "./runtime/effects.js";
import type { EvaluationContext } from "./runtime/evaluator.js";
import type { ComponentLibrary, ComponentSpec } from "./library/types.js";
import { defaultLibrary, validateProgramSchema } from "./library/index.js";
import { mergeLibraries } from "./library/registry.js";
import { Renderer } from "./renderer/renderer.js";
import { morphChildren } from "./renderer/morph.js";
import {
  generatePrompt,
  type PromptOptions,
} from "./prompt/generator.js";
import {
  applyTheme,
  applyPartialTheme,
  clearTokenOverrides,
  resolveTheme,
  sanitiseThemeTokens,
  type ThemeInput,
  type ThemeTokens,
} from "./theme/index.js";
import { componentStyles } from "./theme/styles.js";
import { ensureFontAwesomeLoaded } from "./icons/index.js";

const ATTRIBUTE_THEME = "theme";
const ATTRIBUTE_STREAMING = "streaming";
const ATTRIBUTE_RESPONSE = "response";
const ATTRIBUTE_SHOW_ERRORS = "showerrors";

// Re-exported from `runtime/http.ts` so consumers can import them from
// `./element.js` (the legacy public surface) without reaching into the
// runtime internals.
import type {
  HttpInterceptors,
  HttpRequest,
  HttpResponse,
} from "./runtime/http.js";
export type { HttpInterceptors, HttpRequest, HttpResponse };
/**
 * Internal state slot the router writes to so dependent renders can
 * subscribe to URL changes. Authors do NOT read this slot directly —
 * use the `_route_` identifier instead, which is bound to the same
 * underlying state and additionally exposes `navigate(path)`.
 */
const STATE_ROUTE = "route";

/**
 * Build the reactive `_route_` payload from the router's current state.
 * Returns a plain object with `path`, `params`, `pattern`, `query`, an
 * imperative `navigate(path)` method, plus a `toString()` so template
 * literals like `${_route_}` coerce to the path.
 */
function buildRouteObject(router: Router): Record<string, unknown> {
  const path = router.getPath();
  const params = { ...router.getParams() };
  const pattern = router.getActivePattern();
  const query: Record<string, string> = {};
  if (typeof window !== "undefined" && window.location) {
    const search = window.location.search || "";
    if (search) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      for (const [k, v] of params) query[k] = v;
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
 * Compare two `_route_` payloads field-by-field. The route store writes a
 * fresh object on every render — without a content-aware equality check
 * the reference-only test in `StateStore.set` would treat every replan as
 * a change and schedule a redundant follow-up render. That cascade also
 * breaks per-component closures that capture freshly-rendered DOM nodes:
 * the second render copies new handlers onto the morphed DOM but their
 * closures still point at the (now-detached) fragment from this tick.
 */
function routesEqual(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as { path?: unknown; pattern?: unknown; params?: Record<string, unknown>; query?: Record<string, unknown> };
  const right = b as typeof left;
  if (left.path !== right.path) return false;
  if (left.pattern !== right.pattern) return false;
  return (
    shallowEqualObject(left.params ?? {}, right.params ?? {}) &&
    shallowEqualObject(left.query ?? {}, right.query ?? {})
  );
}

function shallowEqualObject(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Lazily-built `CSSStyleSheet` shared across every instance via
 * `adoptedStyleSheets`. The browser parses the source once and reuses the
 * compiled rules for every shadow root that adopts it, which keeps memory
 * and startup time flat as the number of `<aktion-app>` elements
 * grows. The boolean tracks whether the platform actually supports the
 * adoption API — older runtimes fall back to per-instance `<style>` tags.
 */
let sharedStyleSheet: CSSStyleSheet | null = null;
let sharedStyleSheetSupported: boolean | null = null;

function getSharedStyleSheet(): CSSStyleSheet | null {
  if (sharedStyleSheetSupported === false) return null;
  if (sharedStyleSheet) return sharedStyleSheet;
  try {
    if (
      typeof CSSStyleSheet === "undefined" ||
      !("replaceSync" in CSSStyleSheet.prototype) ||
      // Some test environments (happy-dom) expose `CSSStyleSheet` but its
      // `replaceSync` is a no-op that doesn't propagate to adoption — keep
      // the fallback so the rendered DOM still has styles.
      typeof document === "undefined" ||
      !("adoptedStyleSheets" in Document.prototype)
    ) {
      sharedStyleSheetSupported = false;
      return null;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(componentStyles);
    sharedStyleSheet = sheet;
    sharedStyleSheetSupported = true;
    return sheet;
  } catch {
    sharedStyleSheetSupported = false;
    return null;
  }
}

export class AktionElement extends HTMLElement {
  static readonly tagName = "aktion-app";

  static get observedAttributes(): string[] {
    return [
      ATTRIBUTE_THEME,
      ATTRIBUTE_STREAMING,
      ATTRIBUTE_RESPONSE,
      ATTRIBUTE_SHOW_ERRORS,
    ];
  }

  private readonly state = new StateStore();
  private readonly router = new Router();
  private library: ComponentLibrary = defaultLibrary;
  private readonly http = new HttpRuntime();
  private readonly i18n = new I18nRuntime();
  private readonly effectRunner: EffectRunner;
  private readonly actionDeclRunner: ActionDeclRunner;
  /**
   * Host-registered async tools, exposed to `js{}` blocks (effects + action
   * bodies) as `ctx.tools.<name>(args)`. The runtime never inspects the
   * registry — it just forwards calls — so each handler is responsible for
   * its own validation, auth, and error handling.
   */
  private readonly tools: Record<string, (...args: unknown[]) => unknown> = {};
  private renderer: Renderer;
  private context: EvaluationContext;
  private root: ShadowRoot;
  private rootEl: HTMLElement;
  private errorEl: HTMLElement;
  private currentResponse = "";
  private renderScheduled = false;
  /** True when the program text changed and the runtime needs a re-plan. */
  private programDirty = true;
  private parseErrors: string[] = [];
  /**
   * Token keys most recently applied by an in-script `Theme({...})`
   * declaration. We remember them so the next render can clear stale
   * overrides — otherwise switching from a `Theme(...)` block to the
   * base theme would leave the previous tokens stuck on the host.
   */
  private scriptThemeKeys: ReadonlyArray<keyof ThemeTokens> = [];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.errorEl = document.createElement("div");
    this.errorEl.className = "rui-error-banner";
    this.errorEl.hidden = true;
    this.rootEl = document.createElement("div");
    this.rootEl.className = "rui-root";

    // Adopt the shared, pre-parsed stylesheet when the platform supports
    // it — every instance reuses the same compiled rules instead of
    // parsing a 4k-line CSS string per shadow root. Fall back to an inline
    // `<style>` tag when the constructable-stylesheet API is unavailable
    // (older browsers, some headless DOMs).
    const sheet = getSharedStyleSheet();
    if (sheet) {
      try {
        // `as CSSStyleSheet[]` keeps the typing predictable across DOM lib
        // versions where `adoptedStyleSheets` is typed as readonly.
        (this.root as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
        this.root.append(this.errorEl, this.rootEl);
      } catch {
        this.root.append(this.buildInlineStyle(), this.errorEl, this.rootEl);
      }
    } else {
      this.root.append(this.buildInlineStyle(), this.errorEl, this.rootEl);
    }

    const dispatchAssistantMessage = (message: string): void => {
      this.dispatchEvent(new CustomEvent("assistant-message", {
        detail: { message },
        bubbles: true,
        composed: true,
      }));
    };

    const emit = (eventName: string, detail: unknown): void => {
      this.dispatchEvent(new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      }));
    };
    this.effectRunner = new EffectRunner({
      state: this.state,
      notify: () => this.scheduleRender(),
      onEmit: emit,
      host: this,
      tools: this.tools,
    });
    this.actionDeclRunner = new ActionDeclRunner({
      state: this.state,
      notify: () => this.scheduleRender(),
      onEmit: emit,
      onAssistantMessage: dispatchAssistantMessage,
      host: this,
      tools: this.tools,
    });

    this.context = createContext(this.state, {
      router: this.router,
      library: this.library,
      http: this.http,
      i18n: this.i18n,
      actionRunner: this.actionDeclRunner,
      notify: () => this.scheduleRender(),
      jsBlockExecutor: createInlineJsExecutor({
        state: this.state,
        host: this,
        tools: this.tools,
      }),
    });
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      router: this.router,
      onAssistantMessage: dispatchAssistantMessage,
      // Expose the evaluation context so the renderer can expand
      // user-declared `component Foo() { ... }` calls (per-instance
      // state, §7). We pass a getter rather than the live ref because
      // `this.context` is rebuilt on every `replan()`.
      evaluationContext: () => this.context,
      // Per-instance effect lifecycle: the renderer drains effects
      // discovered inside a `component { … }` body and hands them here
      // so the EffectRunner mounts them with the instance key as prefix.
      // Re-renders are idempotent; `unmountInstanceEffects` fires when
      // the instance disappears from the tree (component-scoped effect
      // teardown, §8 of the side-effects page).
      mountInstanceEffects: (instanceKey, decls, getCtx) =>
        this.effectRunner.syncInstanceEffects(instanceKey, decls, getCtx),
      unmountInstanceEffects: (instanceKey) =>
        this.effectRunner.unmountInstance(instanceKey),
    });

    this.state.subscribe(() => this.scheduleRender());
    this.router.subscribe((detail) => this.handleRouteChange(detail));
  }

  connectedCallback(): void {
    ensureFontAwesomeLoaded(this.root);
    this.applyThemeFromAttribute();
    this.startRouter();
    this.attachPersistenceAdapter();
    const responseAttr = this.getAttribute(ATTRIBUTE_RESPONSE);
    if (responseAttr !== null && responseAttr !== "" && responseAttr !== this.currentResponse) {
      this.setResponse(responseAttr);
      return;
    }
    if (!this.currentResponse) {
      const fallback = (this.textContent ?? "").trim();
      if (fallback) {
        this.setResponse(fallback);
        return;
      }
    }
    // Reconnect path: effects were torn down in `disconnectedCallback`, so we
    // always re-render to give the program a fresh effect-runner mount cycle.
    if (this.currentResponse) {
      this.programDirty = true;
      this.scheduleRender();
    }
  }

  disconnectedCallback(): void {
    this.effectRunner.reset();
    if (this.context) disposeContext(this.context);
    this.router.stop();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === ATTRIBUTE_THEME) this.applyThemeFromAttribute();
    if (name === ATTRIBUTE_STREAMING) {
      // Refresh the error banner: it is suppressed while streaming so partial
      // mid-line content does not flash transient parse errors to the user.
      this.updateErrorBanner();
      this.scheduleRender();
    }
    if (name === ATTRIBUTE_SHOW_ERRORS) {
      this.updateErrorBanner();
    }
    if (name === ATTRIBUTE_RESPONSE) {
      const next = value ?? "";
      if (next !== this.currentResponse) this.setResponse(next);
    }
  }

  /**
   * Register HTTP interceptors used by the Aktion 0.5 HTTP layer (§22.1 of
   * the spec). Interceptors are invoked by the HTTP runtime around every
   * `query`/`mutation`/`subscription` request. Multiple calls merge
   * incrementally — passing `{ onRequest }` only does not clear an
   * existing `onResponse`.
   */
  registerHttpInterceptors(interceptors: HttpInterceptors): void {
    this.http.registerInterceptors(interceptors);
  }

  /** Replace the current program with `text` and re-render from scratch. */
  setResponse(text: string): void {
    if (text === this.currentResponse) return;
    this.currentResponse = text;
    this.programDirty = true;
    this.state.rebind([]);
    // Drop persisted component-local UI state — stale slots from the
    // previous program could otherwise leak into structurally-similar
    // components rendered at the same tree position.
    this.renderer.reset();
    this.parseErrors = [];
    this.scheduleRender();
  }

  /**
   * Aktion 0.5 §26 — serialise the host's current state as
   * a plain JSON-friendly object. Combine with `programText` to round-
   * trip the entire app between turns, between tabs, or between
   * server-rendered HTML and client hydration.
   */
  serializeState(): Record<string, unknown> {
    return this.state.snapshot();
  }

  /**
   * Apply a snapshot to the live state store. Values land in `values`
   * immediately, so any subsequent `$state x = default` declaration
   * preserves the hydrated value (the planner only writes defaults for
   * names that do not yet exist).
   *
   * If a render is in flight, this call schedules a follow-up render so
   * the new values surface in the next paint.
   */
  hydrateState(snapshot: Readonly<Record<string, unknown>>): void {
    this.state.hydrate(snapshot);
    this.scheduleRender();
  }

  /**
   * Aktion 0.5 §14 — Delta Protocol. Apply a structured
   * sequence of operations to the current program; the runtime mounts
   * the patched program with the user's `$state` preserved across the
   * diff.
   *
   * Op shapes (see `src/tooling/delta.ts` for the full reference):
   *
   *   - `{ kind: "patch",   target: "name", value: any }`
   *   - `{ kind: "replace", binding: "name", source: "Expr" }`
   *   - `{ kind: "append",  binding: "name", item: "Expr" }`
   *   - `{ kind: "new",     source: "binding = Expr  // or full decl" }`
   *   - `{ kind: "delete",  binding: "name" }`
   *
   * Returns the advisory warnings raised by the delta (e.g. for ops
   * that targeted a missing binding). The host can surface them as a
   * banner or ignore them — partial deltas always still mount the
   * remaining patched program.
   */
  applyDelta(ops: readonly DeltaOp[]): string[] {
    const snapshot = this.state.snapshot();
    const result = applyDelta(this.currentResponse, ops);
    // Apply patch ops on top of the current snapshot, so `applyDelta`
    // is a single atomic step: state survives the structural diff
    // *and* picks up the explicit patches.
    Object.assign(snapshot, result.stateUpdates);
    this.loadSnapshot({ programText: result.programText, state: snapshot });
    return result.warnings;
  }

  /**
   * Aktion 0.5 §26 — atomic load of a serialised payload.
   * Sets the program text *and* the state in one shot so the next
   * render plans the program with the hydrated values already in
   * place. Use this for SSR hydration, conversational continuity
   * across turns, and URL-deep-link restoration.
   */
  loadSnapshot(payload: { programText: string; state: Record<string, unknown> }): void {
    this.currentResponse = payload.programText;
    this.programDirty = true;
    // Clear *defaults* and any leftover values from the previous program
    // before seeding from the snapshot — without this, atoms declared
    // by the previous program would keep their old defaults after the
    // new program plans them with new initial expressions.
    this.state.rebind([]);
    this.renderer.reset();
    this.parseErrors = [];
    // Seed values BEFORE the next render plans the new program. Declare
    // only writes defaults when `has(name) === false`, so the planner
    // will leave our hydrated values intact.
    this.state.hydrate(payload.state);
    this.scheduleRender();
  }

  /** Append a streaming chunk and re-render. */
  appendChunk(chunk: string): void {
    // Coerce defensively so callers can forward e.g. `decoder.decode(...)`
    // results without checking emptiness, and so a stray non-string never
    // corrupts the buffer with `"undefined"`-style concatenation.
    if (chunk === null || chunk === undefined) return;
    const text = typeof chunk === "string" ? chunk : String(chunk);
    if (text === "") return;
    this.currentResponse += text;
    this.programDirty = true;
    this.scheduleRender();
  }

  setTheme(theme: ThemeInput): void {
    applyTheme(this, resolveTheme(theme));
    // Setting a new base theme wipes every token CSS variable, so the
    // tracker for in-script overrides starts fresh — the next render will
    // reapply any `Theme({...})` from the active program on top of the
    // freshly-painted base.
    this.scriptThemeKeys = [];
    this.scheduleRender();
  }

  registerComponents(components: ComponentSpec[], rootName?: string): void {
    this.library = mergeLibraries(this.library, { components, root: rootName });
    // Swap the library on the existing renderer so per-instance state slots
    // (Tabs active pane, Popover open/closed, …) carry over to the next
    // render. Recreating the renderer would have dropped that state.
    this.renderer.setLibrary(this.library);
    this.scheduleRender();
  }

  /**
   * Build a system prompt for the active library. Pass `{ mode: "chat" }`
   * for the compact chat-focused prompt; omit `mode` (or pass `"full"`)
   * for the complete prompt.
   */
  getSystemPrompt(options?: PromptOptions): string {
    return generatePrompt(this.library, options ?? {});
  }

  /** Programmatic navigation API. */
  navigate(path: string): void {
    this.router.navigate(path);
  }

  /**
   * Register host-supplied async tools exposed to `js{}` blocks as
   * `ctx.tools.<name>(args)`. Replaces any previously-registered tools
   * with the same name.
   */
  setTools(tools: Record<string, (...args: unknown[]) => unknown>): void {
    for (const key of Object.keys(this.tools)) delete this.tools[key];
    for (const [name, fn] of Object.entries(tools ?? {})) {
      if (typeof fn === "function") this.tools[name] = fn;
    }
  }

  /** Current route path (`/`, `/about`, …). */
  get route(): string {
    return this.router.getPath();
  }

  clear(): void {
    this.currentResponse = "";
    this.state.rebind([]);
    this.effectRunner.reset();
    // Drop component-local UI state (Tabs active pane, Popover open flag,
    // …). Without this, a fresh program would inherit slot values from
    // the previous program and snap stateful primitives into the wrong
    // initial UI.
    this.renderer.reset();
    this.programDirty = true;
    this.parseErrors = [];
    this.errorEl.hidden = true;
    this.errorEl.replaceChildren();
    this.rootEl.replaceChildren();
    // Drop any cached active match — the next render will recompute from
    // the current path against whatever routes the new program declares.
    this.router.setActiveMatch(null, {});
  }

  // ----- Property accessors -----

  get response(): string {
    return this.currentResponse;
  }

  set response(value: string) {
    this.setResponse(value);
  }

  get streaming(): boolean {
    return parseBooleanAttribute(this.getAttribute(ATTRIBUTE_STREAMING));
  }

  set streaming(value: boolean) {
    if (value) this.setAttribute(ATTRIBUTE_STREAMING, "true");
    else this.removeAttribute(ATTRIBUTE_STREAMING);
  }

  get showErrors(): boolean {
    return parseBooleanAttribute(this.getAttribute(ATTRIBUTE_SHOW_ERRORS));
  }

  set showErrors(value: boolean) {
    if (value) this.setAttribute(ATTRIBUTE_SHOW_ERRORS, "true");
    else this.removeAttribute(ATTRIBUTE_SHOW_ERRORS);
  }

  // ----- Internal -----

  private buildInlineStyle(): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = componentStyles;
    return style;
  }

  /**
   * Start the router so the hash listener is attached and `_route_` is
   * seeded with the current URL. Idempotent — safe to call from
   * `connectedCallback`.
   */
  private startRouter(): void {
    this.router.start();
    // Seed `_route_` immediately so the very first render sees the URL
    // hash (instead of the default "/").
    this.writeRouteState();
  }

  /**
   * Write `_route_` only when its content actually changed. Avoids
   * triggering a redundant render-after-replan cascade — see
   * `routesEqual` for the structural comparison.
   */
  private writeRouteState(): void {
    const next = buildRouteObject(this.router);
    if (routesEqual(this.state.get(STATE_ROUTE), next)) return;
    this.state.set(STATE_ROUTE, next);
  }

  /**
   * Wire `$$variable` declarations to a `localStorage`-backed adapter.
   * Persistence is namespaced by the element's `id` (falling back to the
   * tag name when no id is set) so two `<aktion-app>` elements on
   * the same page don't collide. SSR / sandboxed contexts without storage
   * silently degrade to in-memory only — `$$variable` still works, just
   * without survival across reloads.
   */
  private attachPersistenceAdapter(): void {
    const storage = typeof window !== "undefined" ? window.localStorage : null;
    const prefix = `rui:${AktionElement.tagName}:${this.id || "default"}`;
    const adapter = createLocalStorageAdapter(prefix, storage ?? null);
    this.state.setPersistenceAdapter(adapter);
  }

  /**
   * React to any path change: write the new value into the route slot (so
   * `_route_` reads re-evaluate), schedule a re-render, and bubble a
   * `route-change` event so host pages can sync analytics or sidebars.
   */
  private handleRouteChange(detail: RouteChangeDetail): void {
    this.writeRouteState();
    this.dispatchEvent(new CustomEvent("route-change", {
      detail,
      bubbles: true,
      composed: true,
    }));
    this.scheduleRender();
  }

  private applyThemeFromAttribute(): void {
    const attr = this.getAttribute(ATTRIBUTE_THEME);
    applyTheme(this, resolveTheme(attr));
    // Reapplying the base theme wipes every token CSS variable, so the
    // tracker for in-script overrides has to start fresh — the variables
    // it was tracking just got rewritten by the base layer.
    this.scriptThemeKeys = [];
  }

  /**
   * Look for a `theme = Theme({...})` (or any binding returning a
   * `ThemeNode`) in the active program. If found, write its tokens to the
   * host as CSS custom properties so the in-script declaration layers on
   * top of the attribute / `setTheme()` base. The previous render's keys
   * are cleared first so removing a `Theme(...)` line snaps the renderer
   * back to the underlying theme without a reload.
   */
  private applyScriptThemeOverrides(): void {
    if (this.scriptThemeKeys.length > 0) {
      clearTokenOverrides(this, this.scriptThemeKeys);
      this.scriptThemeKeys = [];
    }
    const themeBinding = this.context.bindings.get("theme");
    if (!themeBinding) return;
    let value: unknown;
    try { value = themeBinding(); } catch { return; }
    if (!isThemeNode(value)) return;
    const tokens = sanitiseThemeTokens(value.tokens);
    if (Object.keys(tokens).length === 0) return;
    this.scriptThemeKeys = applyPartialTheme(this, tokens);
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => this.renderNow());
  }

  private renderNow(): void {
    this.renderScheduled = false;
    if (!this.isConnected) return;

    // Re-plan only when the program text changed. This is critical:
    // re-planning tears down and re-mounts effects/actions/endpoint resources,
    // which would re-fire their notifies and cause an infinite render loop
    // if we did it every tick.
    if (this.programDirty) {
      this.replan();
      this.programDirty = false;
    }

    // Apply any in-script `Theme({...})` declaration before render so the
    // tokens are in place when components measure themselves or read CSS
    // custom properties (charts that grab `--rui-chart-1`, etc.).
    this.applyScriptThemeOverrides();

    // The program's entry-point binding is `_app_`. Older clients that
    // still emit `root = …` keep working: we fall back to it when no
    // `_app_` binding is registered.
    const appBinding = this.context.bindings.get("_app_") ?? this.context.bindings.get("root");
    let rootValue: unknown = null;
    if (appBinding) {
      try {
        rootValue = appBinding();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[aktion] _app_ evaluation error", err);
      }
    }

    // Each tick we re-evaluate the entire tree, but instead of throwing the
    // live DOM away (`replaceChildren`) we hand the freshly-rendered tree
    // to a small reconciler that diffs against the existing DOM. That keeps
    // form inputs, scroll positions, <details>.open, and any other browser-
    // owned state stable across renders — typing into one input no longer
    // resets the active tab three components over. The focus snapshot is
    // still useful as a defensive backstop for the rare case where a node's
    // identity actually changes (different tag, replaced subtree).
    this.renderer.beginRender();
    const focusSnapshot = this.captureFocus();
    const rendered = this.renderer.render(rootValue);
    morphChildren(this.rootEl, rendered);
    this.renderer.endRender();
    this.restoreFocus(focusSnapshot);
  }

  private captureFocus(): FocusSnapshot | null {
    const active = this.root.activeElement as HTMLElement | null;
    if (!active || !this.rootEl.contains(active)) return null;
    const id = active.id || null;
    if (!id) return null;
    const snapshot: FocusSnapshot = { id, tagName: active.tagName };
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) {
      snapshot.selectionStart = active.selectionStart;
      snapshot.selectionEnd = active.selectionEnd;
      snapshot.selectionDirection = active.selectionDirection ?? null;
    }
    return snapshot;
  }

  private restoreFocus(snapshot: FocusSnapshot | null): void {
    if (!snapshot) return;
    const target = this.rootEl.querySelector<HTMLElement>(`#${cssEscapeId(snapshot.id)}`);
    if (!target || target.tagName !== snapshot.tagName) return;
    // If the morph reconciler reused the same DOM node, focus and selection
    // were never lost; skip the work to avoid spurious focus/blur events.
    const root = this.root as unknown as { activeElement: Element | null };
    if (root.activeElement === target) return;
    target.focus();
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) &&
      snapshot.selectionStart != null &&
      snapshot.selectionEnd != null
    ) {
      applySelectionRange(
        target,
        snapshot.selectionStart,
        snapshot.selectionEnd,
        snapshot.selectionDirection ?? "none",
      );
    }
  }

  private replan(): void {
    this.effectRunner.reset();
    // Drop any state-store subscribers / cleanup callbacks the previous
    // context attached (computed-state derivations, …) so they don't
    // accumulate across replans.
    if (this.context) disposeContext(this.context);
    this.context = createContext(this.state, {
      router: this.router,
      library: this.library,
      http: this.http,
      i18n: this.i18n,
      actionRunner: this.actionDeclRunner,
      notify: () => this.scheduleRender(),
      jsBlockExecutor: createInlineJsExecutor({
        state: this.state,
        host: this,
        tools: this.tools,
      }),
    });

    const program = parse(this.currentResponse);
    // Aktion 0.5 — schema validator runs alongside the parser
    // so multi-positional calls, unknown props, enum mismatches, and
    // legacy Theme tokens become fatal errors (mirroring the parser-level
    // migration errors for syntactic legacy forms). The banner surfaces
    // them together so authors see one unified list.
    const schemaErrors = validateProgramSchema(program, this.library);
    if (schemaErrors.length > 0) {
      program.errors = [...program.errors, ...schemaErrors];
    }
    planProgram(program, this.context);

    // Mount top-level `effect [ ...deps ] { … }` declarations from the
    // program. The runner manages their lifecycle (mount, re-run on state
    // changes, teardown). Component-local effects (declared *inside* a
    // `component { … }` body) are mounted by the renderer per instance —
    // see the `mountInstanceEffects` hook wired into the Renderer above.
    const effectDecls = [...this.context.effectDecls.values()];
    if (effectDecls.length > 0) {
      this.effectRunner.syncEffects(effectDecls, () => this.context);
    }

    // Seed `_route_` so user expressions like `_route_.path == "/about"`
    // resolve even before the first hashchange fires.
    this.writeRouteState();

    this.parseErrors = [
      ...program.errors.map((e) => `Line ${e.line}: ${e.message}`),
      ...this.effectRunner.getErrors(),
    ];
    this.updateErrorBanner();

    // While streaming, the in-flight chunk is almost always mid-token, so
    // errors are expected and transient. Defer dispatch until streaming ends.
    if (program.errors.length > 0 && !this.streaming) {
      this.dispatchEvent(new CustomEvent("error", {
        detail: { errors: program.errors },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private updateErrorBanner(): void {
    // The banner is additional attributes via the `showerrors` attribute. While the response
    // is still streaming, the in-flight last line is almost always mid-token
    // and will fail to parse, so we also suppress the banner during streaming
    // even when errors are explicitly enabled. Errors are still dispatched via
    // the `error` event for host apps that want to observe them programmatically.
    if (
      !this.showErrors ||
      this.streaming ||
      this.parseErrors.length === 0
    ) {
      this.errorEl.hidden = true;
      this.errorEl.replaceChildren();
      return;
    }
    this.errorEl.hidden = false;
    const title = document.createElement("div");
    title.textContent = `${this.parseErrors.length} parse issue${this.parseErrors.length === 1 ? "" : "s"} (rendered partial UI):`;
    const list = document.createElement("ul");
    for (const message of this.parseErrors.slice(0, 5)) {
      const li = document.createElement("li");
      li.textContent = message;
      list.append(li);
    }
    this.errorEl.replaceChildren(title, list);
  }
}

interface FocusSnapshot {
  id: string;
  tagName: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  selectionDirection?: "forward" | "backward" | "none" | null;
}

/**
 * Escape an id for use in `document.querySelector('#...')`. CSS.escape exists
 * in all modern browsers and happy-dom; we fall back to a tiny shim for older
 * environments so the renderer never blows up while restoring focus.
 */
function cssEscapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([^A-Za-z0-9_-])/g, "\\$1");
}

/**
 * Input types that do not support `setSelectionRange` per the WHATWG spec
 * — calling it throws `InvalidStateError`. We round-trip through
 * `type="text"` so we can still restore the caret, then flip the type back.
 * This is the same workaround major frameworks (and morphdom) use.
 */
const SELECTION_UNSUPPORTED_TYPES = new Set([
  "email",
  "number",
  "tel",
  "url",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "color",
]);

function applySelectionRange(
  target: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  direction: "forward" | "backward" | "none",
): void {
  if (target instanceof HTMLInputElement && SELECTION_UNSUPPORTED_TYPES.has(target.type)) {
    const previousType = target.type;
    try {
      // Flip to `text` so the platform honours setSelectionRange, then
      // restore the declared type. This preserves both caret position and
      // type-specific validation / UI on the element.
      target.type = "text";
      target.setSelectionRange(start, end, direction);
    } catch {
      // Last-resort: at least keep focus; modern browsers will park the
      // caret at the end of the field on focus().
    } finally {
      target.type = previousType;
    }
    return;
  }
  try {
    target.setSelectionRange(start, end, direction);
  } catch {
    // Defensive: some headless DOM implementations throw even for text
    // inputs in edge cases. Focus alone is good enough.
  }
}

/**
 * HTML boolean-ish attribute parser: treat empty strings, "true", "1", or
 * the attribute name itself as `true`. Anything else (including missing) is
 * `false`. This matches how `<input disabled>` and friends are usually read.
 */
function parseBooleanAttribute(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === ATTRIBUTE_SHOW_ERRORS) return true;
  return false;
}

export function defineElement(): void {
  if (!customElements.get(AktionElement.tagName)) {
    customElements.define(AktionElement.tagName, AktionElement);
  }
}
