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
 *   - Properties:
 *       `response: string`        — current Streaming UI Script text
 *       `tools: ToolRegistry`     — async functions backing Query/Mutation
 *       `streaming: boolean`      — reflects the `streaming` attribute
 *       `showErrors: boolean`     — reflects the `showerrors` attribute
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
 *   - `route-change` — fired when the active hash route changes.
 *
 * JavaScript interactions (`Script(...)`, `@Js(...)`) and hash-based routing
 * (`Routes`, `Route`, `NavLink`, `@Navigate`) are always available — no
 * additional attributes required. The system prompt comes in two flavours:
 *   - `getSystemPrompt()` — full prompt (everything the language offers).
 *   - `getSystemPrompt({ mode: "chat" })` — compact chat-focused prompt.
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
  isThemeNode,
  type ToolRegistry,
  type RouteChangeDetail,
} from "./runtime/index.js";
import type { EvaluationContext } from "./runtime/evaluator.js";
import type { ComponentLibrary, ComponentSpec } from "./library/types.js";
import { defaultLibrary } from "./library/index.js";
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
/**
 * Reserved reactive state name written by the router. Read it from any
 * expression as `$route` to access the current path. Kept in lock-step with
 * `window.location.hash`.
 */
const STATE_ROUTE = "route";

/**
 * Lazily-built `CSSStyleSheet` shared across every instance via
 * `adoptedStyleSheets`. The browser parses the source once and reuses the
 * compiled rules for every shadow root that adopts it, which keeps memory
 * and startup time flat as the number of `<streaming-ui-script>` elements
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

export class StreamingUiScriptElement extends HTMLElement {
  static readonly tagName = "streaming-ui-script";

  static get observedAttributes(): string[] {
    return [
      ATTRIBUTE_THEME,
      ATTRIBUTE_STREAMING,
      ATTRIBUTE_RESPONSE,
      ATTRIBUTE_SHOW_ERRORS,
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
    });

    this.queries.setNotify(() => this.scheduleRender());
    this.state.subscribe(() => this.scheduleRender());
    this.router.subscribe((detail) => this.handleRouteChange(detail));
  }

  connectedCallback(): void {
    ensureFontAwesomeLoaded(this.root);
    this.applyThemeFromAttribute();
    this.syncScriptRunnerStreaming();
    this.startRouter();
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
    // Reconnect path: scripts were torn down in `disconnectedCallback`, so
    // we always re-render to give them a chance to re-register. Marking
    // the program dirty also re-plans queries from a clean slate.
    if (this.currentResponse) {
      this.programDirty = true;
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
      this.syncScriptRunnerStreaming();
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
    // Drop persisted component-local UI state — stale slots from the
    // previous program could otherwise leak into structurally-similar
    // components rendered at the same tree position.
    this.renderer.reset();
    this.parseErrors = [];
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

  setTools(tools: ToolRegistry): void {
    this.queries.setTools(tools);
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

  /** Current route path (`/`, `/about`, …). */
  get route(): string {
    return this.router.getPath();
  }

  clear(): void {
    this.currentResponse = "";
    this.queries.reset();
    this.scriptRunner.reset();
    this.state.rebind([]);
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

  get tools(): ToolRegistry {
    return this.queries.getTools();
  }

  set tools(value: ToolRegistry | null) {
    this.setTools(value ?? {});
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

  private syncScriptRunnerStreaming(): void {
    this.scriptRunner.setStreaming(this.streaming);
  }

  /**
   * Start the router so the hash listener is attached and `$route` is
   * seeded with the current URL. Idempotent — safe to call from
   * `connectedCallback`.
   */
  private startRouter(): void {
    this.router.start();
    // Seed `$route` immediately so the very first render sees the URL
    // hash (instead of the default "/").
    this.state.set(STATE_ROUTE, this.router.getPath());
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

    // Re-plan only when the program text changed. This is critical: replanning
    // tears down and re-registers all queries, which would re-fire their
    // notifies and cause an infinite render loop.
    if (this.programDirty) {
      this.replan();
      this.programDirty = false;
    }

    // Apply any in-script `Theme({...})` declaration before render so the
    // tokens are in place when components measure themselves or read CSS
    // custom properties (charts that grab `--rui-chart-1`, etc.).
    this.applyScriptThemeOverrides();

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

    // Each tick we re-evaluate the entire tree, but instead of throwing the
    // live DOM away (`replaceChildren`) we hand the freshly-rendered tree
    // to a small reconciler that diffs against the existing DOM. That keeps
    // form inputs, scroll positions, <details>.open, and any other browser-
    // owned state stable across renders — typing into one input no longer
    // resets the active tab three components over. The focus snapshot is
    // still useful as a defensive backstop for the rare case where a node's
    // identity actually changes (different tag, replaced subtree).
    this.syncScriptRunnerStreaming();
    this.scriptRunner.beginCycle();
    this.renderer.beginRender();
    const focusSnapshot = this.captureFocus();
    const rendered = this.renderer.render(rootValue);
    morphChildren(this.rootEl, rendered);
    this.renderer.endRender();
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
    this.queries.reset();
    this.context = createContext(this.state, this.queries, this.router);
    this.queries.setNotify(() => this.scheduleRender());

    const program = parse(this.currentResponse);
    planProgram(program, this.context);

    // Seed `$route` so user expressions like `$route == "/about"` resolve
    // even before the first hashchange fires.
    this.state.set(STATE_ROUTE, this.router.getPath());

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
  if (!customElements.get(StreamingUiScriptElement.tagName)) {
    customElements.define(StreamingUiScriptElement.tagName, StreamingUiScriptElement);
  }
}
