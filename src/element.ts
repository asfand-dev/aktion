/**
 * `<streaming-ui-script>` custom element.
 *
 * Public surface:
 *   - Attributes:
 *       `theme`             — "light" | "dark" | JSON token map
 *       `streaming`         — "true" while text is still arriving from the LLM
 *       `response`          — Streaming UI Script program (string)
 *       `showerrors`        — "true" to render parse errors in the UI
 *                             (defaults to off; the `error` event still fires)
 *       `enable-javascript` — "true" to allow `Script(...)` and `@Js(...)` to
 *                             execute (default off for safety; the system
 *                             prompt also omits the JS section by default).
 *   - Properties:
 *       `response: string`        — current Streaming UI Script text
 *       `tools: ToolRegistry`     — async functions backing Query/Mutation
 *       `streaming: boolean`      — reflects the `streaming` attribute
 *       `showErrors: boolean`     — reflects the `showerrors` attribute
 *       `enableJavascript: boolean` — reflects the `enable-javascript` attribute
 *   - Methods:
 *       `setResponse(text)`       — replace the current program
 *       `appendChunk(text)`       — append a streaming chunk and re-render
 *       `setTheme(theme)`         — apply a theme by name or token map
 *       `setTools(tools)`         — register tools used by Query/Mutation
 *       `registerComponents(...)` — extend the built-in library
 *       `getSystemPrompt(opts)`   — build a system prompt for the current library
 *       `clear()`                 — reset state and clear the rendered output
 *
 * Events:
 *   - `assistant-message` — fired when the user clicks a follow-up or a button
 *     runs `@ToAssistant("...")`. `event.detail.message` carries the text.
 *   - `error` — fired with `event.detail.errors` for parse failures.
 */

import { parse } from "./parser/index.js";
import {
  StateStore,
  QueryRegistry,
  ActionRunner,
  ScriptRunner,
  Router,
  createContext,
  planProgram,
  type ToolRegistry,
  type RouteChangeDetail,
} from "./runtime/index.js";
import type { EvaluationContext } from "./runtime/evaluator.js";
import type { ComponentLibrary, ComponentSpec } from "./library/types.js";
import { defaultLibrary } from "./library/index.js";
import { mergeLibraries } from "./library/registry.js";
import { Renderer } from "./renderer/renderer.js";
import {
  generatePrompt,
  type PromptOptions,
} from "./prompt/generator.js";
import {
  applyTheme,
  resolveTheme,
  type ThemeInput,
} from "./theme/index.js";
import { componentStyles } from "./theme/styles.js";

const ATTRIBUTE_THEME = "theme";
const ATTRIBUTE_STREAMING = "streaming";
const ATTRIBUTE_RESPONSE = "response";
const ATTRIBUTE_SHOW_ERRORS = "showerrors";
const ATTRIBUTE_ENABLE_JS = "enable-javascript";
const ATTRIBUTE_ENABLE_ROUTES = "enable-routes";
/**
 * Reserved reactive state name written by the router. Read it from any
 * expression as `$route` to access the current path. Kept in lock-step with
 * `window.location.hash` when `enable-routes="true"`.
 */
const STATE_ROUTE = "route";

export class StreamingUiScriptElement extends HTMLElement {
  static readonly tagName = "streaming-ui-script";

  static get observedAttributes(): string[] {
    return [
      ATTRIBUTE_THEME,
      ATTRIBUTE_STREAMING,
      ATTRIBUTE_RESPONSE,
      ATTRIBUTE_SHOW_ERRORS,
      ATTRIBUTE_ENABLE_JS,
      ATTRIBUTE_ENABLE_ROUTES,
    ];
  }

  private readonly state = new StateStore();
  private readonly queries = new QueryRegistry();
  private readonly scriptRunner: ScriptRunner;
  private readonly actionRunner: ActionRunner;
  private readonly router = new Router();
  private library: ComponentLibrary = defaultLibrary;
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

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = componentStyles;
    this.errorEl = document.createElement("div");
    this.errorEl.className = "rui-error-banner";
    this.errorEl.hidden = true;
    this.rootEl = document.createElement("div");
    this.rootEl.className = "rui-root";
    this.root.append(style, this.errorEl, this.rootEl);

    const dispatchAssistantMessage = (message: string): void => {
      this.dispatchEvent(new CustomEvent("assistant-message", {
        detail: { message },
        bubbles: true,
        composed: true,
      }));
    };

    this.scriptRunner = new ScriptRunner({
      state: this.state,
      queries: this.queries,
      getRoot: () => this.root,
      getHost: () => this,
      onAssistantMessage: dispatchAssistantMessage,
    });

    this.actionRunner = new ActionRunner({
      getContext: () => this.context,
      onAssistantMessage: dispatchAssistantMessage,
      scriptRunner: this.scriptRunner,
      router: this.router,
    });

    this.context = createContext(this.state, this.queries, this.router);
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      actionRunner: this.actionRunner,
      scriptRunner: this.scriptRunner,
      router: this.router,
      routesEnabled: this.enableRoutes,
    });

    this.queries.setNotify(() => this.scheduleRender());
    this.state.subscribe(() => this.scheduleRender());
    this.router.subscribe((detail) => this.handleRouteChange(detail));
  }

  connectedCallback(): void {
    this.applyThemeFromAttribute();
    this.syncScriptRunnerFlags();
    this.syncRouter();
    const responseAttr = this.getAttribute(ATTRIBUTE_RESPONSE);
    if (responseAttr !== null && responseAttr !== "") {
      this.setResponse(responseAttr);
      return;
    }
    if (!this.currentResponse) {
      const fallback = (this.textContent ?? "").trim();
      if (fallback) {
        this.setResponse(fallback);
      }
    } else {
      this.scheduleRender();
    }
  }

  disconnectedCallback(): void {
    this.scriptRunner.reset();
    this.router.stop();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === ATTRIBUTE_THEME) this.applyThemeFromAttribute();
    if (name === ATTRIBUTE_STREAMING) {
      // Refresh the error banner: it is suppressed while streaming so partial
      // mid-line content does not flash transient parse errors to the user.
      this.updateErrorBanner();
      this.syncScriptRunnerFlags();
      this.scheduleRender();
    }
    if (name === ATTRIBUTE_SHOW_ERRORS) {
      this.updateErrorBanner();
    }
    if (name === ATTRIBUTE_RESPONSE) {
      const next = value ?? "";
      if (next !== this.currentResponse) this.setResponse(next);
    }
    if (name === ATTRIBUTE_ENABLE_JS) {
      this.syncScriptRunnerFlags();
      this.scheduleRender();
    }
    if (name === ATTRIBUTE_ENABLE_ROUTES) {
      this.syncRouter();
      this.scheduleRender();
    }
  }

  /** Replace the current program with `text` and re-render from scratch. */
  setResponse(text: string): void {
    if (text === this.currentResponse) return;
    this.currentResponse = text;
    this.programDirty = true;
    this.state.rebind([]);
    this.queries.reset();
    // Drop any scripts left over from the previous program — they reference
    // the old state graph and would leak intervals / event listeners.
    this.scriptRunner.reset();
    this.scheduleRender();
  }

  /** Append a streaming chunk and re-render. */
  appendChunk(chunk: string): void {
    if (!chunk) return;
    this.currentResponse += chunk;
    this.programDirty = true;
    this.scheduleRender();
  }

  setTheme(theme: ThemeInput): void {
    applyTheme(this, resolveTheme(theme));
  }

  setTools(tools: ToolRegistry): void {
    this.queries.setTools(tools);
  }

  registerComponents(components: ComponentSpec[], rootName?: string): void {
    this.library = mergeLibraries(this.library, { components, root: rootName });
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      actionRunner: this.actionRunner,
      scriptRunner: this.scriptRunner,
    });
    this.scheduleRender();
  }

  getSystemPrompt(options?: PromptOptions): string {
    // Default the feature flags to whatever the host has opted into so the
    // prompt and runtime stay consistent. Spread caller options first, then
    // resolve each flag with `??` so an explicit `undefined` falls back to
    // the attribute rather than silently disabling a feature.
    const merged: PromptOptions = {
      ...options,
      enableJavascript: options?.enableJavascript ?? this.enableJavascript,
      enableRoutes: options?.enableRoutes ?? this.enableRoutes,
    };
    return generatePrompt(this.library, merged);
  }

  /** Programmatic navigation API. No-op when `enable-routes` is off. */
  navigate(path: string): void {
    if (!this.enableRoutes) return;
    this.router.navigate(path);
  }

  /** Current route path (`/`, `/about`, …). Returns "/" when routing is off. */
  get route(): string {
    return this.router.getPath();
  }

  clear(): void {
    this.currentResponse = "";
    this.queries.reset();
    this.scriptRunner.reset();
    this.state.rebind([]);
    this.programDirty = true;
    this.parseErrors = [];
    this.errorEl.hidden = true;
    this.rootEl.replaceChildren();
    // Drop any cached active match — the next render will recompute from
    // the current path against whatever Routes the new program declares.
    this.router.setActiveMatch(null, {});
  }

  // ----- Property accessors -----

  get response(): string {
    return this.currentResponse;
  }

  set response(value: string) {
    this.setResponse(value);
  }

  get tools(): ToolRegistry | null {
    return null;
  }

  set tools(value: ToolRegistry | null) {
    this.setTools(value ?? {});
  }

  get streaming(): boolean {
    return this.getAttribute(ATTRIBUTE_STREAMING) === "true";
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

  get enableJavascript(): boolean {
    return parseBooleanAttribute(this.getAttribute(ATTRIBUTE_ENABLE_JS));
  }

  set enableJavascript(value: boolean) {
    if (value) this.setAttribute(ATTRIBUTE_ENABLE_JS, "true");
    else this.removeAttribute(ATTRIBUTE_ENABLE_JS);
  }

  get enableRoutes(): boolean {
    return parseBooleanAttribute(this.getAttribute(ATTRIBUTE_ENABLE_ROUTES));
  }

  set enableRoutes(value: boolean) {
    if (value) this.setAttribute(ATTRIBUTE_ENABLE_ROUTES, "true");
    else this.removeAttribute(ATTRIBUTE_ENABLE_ROUTES);
  }

  // ----- Internal -----

  private syncScriptRunnerFlags(): void {
    this.scriptRunner.setEnabled(this.enableJavascript);
    this.scriptRunner.setStreaming(this.streaming);
  }

  /**
   * Attach or detach the hash-change listener based on the current value of
   * the `enable-routes` attribute. Recreates the renderer so component
   * helpers see the correct `routesEnabled` flag immediately.
   */
  private syncRouter(): void {
    const enabled = this.enableRoutes;
    if (enabled) {
      this.router.start();
      // Seed `$route` immediately so the very first render sees the URL
      // hash (instead of the default "/").
      this.state.set(STATE_ROUTE, this.router.getPath());
    } else {
      this.router.stop();
    }
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      actionRunner: this.actionRunner,
      scriptRunner: this.scriptRunner,
      router: this.router,
      routesEnabled: enabled,
    });
  }

  /**
   * React to any path change: write the new value into `$route` (so
   * conditional expressions re-evaluate), schedule a re-render, and bubble
   * a `route-change` event so host pages can sync analytics or sidebars.
   */
  private handleRouteChange(detail: RouteChangeDetail): void {
    this.state.set(STATE_ROUTE, detail.path);
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
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => this.renderNow());
  }

  private renderNow(): void {
    this.renderScheduled = false;
    if (!this.isConnected) return;

    // Re-plan only when the program text changed. This is critical: replanning
    // tears down and re-registers all queries, which would re-fire their
    // notifies and cause an infinite render loop.
    if (this.programDirty) {
      this.replan();
      this.programDirty = false;
    }

    const rootBinding = this.context.bindings.get("root");
    let rootValue: unknown = null;
    if (rootBinding) {
      try {
        rootValue = rootBinding();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[streaming-ui-script] root evaluation error", err);
      }
    }

    // Each tick replaces the entire subtree, which would otherwise blur the
    // user's focused field on every keystroke (since text inputs trigger a
    // re-render via two-way binding). Snapshot the focus + selection before
    // the swap and restore it on the matching element afterwards so typing
    // feels native.
    const focusSnapshot = this.captureFocus();
    this.syncScriptRunnerFlags();
    this.scriptRunner.beginCycle();
    const rendered = this.renderer.render(rootValue);
    this.rootEl.replaceChildren(rendered);
    this.restoreFocus(focusSnapshot);
    // Run scripts AFTER the DOM is in place so `ctx.query("id")` resolves.
    this.scriptRunner.flush();
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
    target.focus();
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) &&
      snapshot.selectionStart != null &&
      snapshot.selectionEnd != null
    ) {
      try {
        target.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd,
          snapshot.selectionDirection ?? "none",
        );
      } catch {
        // Some input types (e.g. number, email) reject setSelectionRange.
      }
    }
  }

  private replan(): void {
    this.queries.reset();
    this.context = createContext(this.state, this.queries, this.router);
    this.queries.setNotify(() => this.scheduleRender());

    const program = parse(this.currentResponse);
    planProgram(program, this.context);

    // Seed `$route` so user expressions like `$route == "/about"` resolve
    // even before the first hashchange fires. We never overwrite a
    // user-declared `$route` default — `set` only writes if the new value
    // differs from what's stored, and `state.has("route")` is preserved by
    // the planner's first pass.
    if (this.enableRoutes) {
      this.state.set(STATE_ROUTE, this.router.getPath());
    }

    this.parseErrors = program.errors.map(
      (e) => `Line ${e.line}: ${e.message}`,
    );
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
    // The banner is opt-in via the `showerrors` attribute. While the response
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
  if (!customElements.get(StreamingUiScriptElement.tagName)) {
    customElements.define(StreamingUiScriptElement.tagName, StreamingUiScriptElement);
  }
}
