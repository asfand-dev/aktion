/**
 * `<llm-response-ui-lang>` custom element.
 *
 * Public surface:
 *   - Attributes:
 *       `theme`             — "light" | "dark" | JSON token map
 *       `streaming`         — "true" while text is still arriving from the LLM
 *   - Properties:
 *       `response: string`        — current LLM Response UI Lang text
 *       `tools: ToolRegistry`     — async functions backing Query/Mutation
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
  createContext,
  planProgram,
  type ToolRegistry,
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

export class LlmResponseUiLangElement extends HTMLElement {
  static readonly tagName = "llm-response-ui-lang";

  static get observedAttributes(): string[] {
    return [ATTRIBUTE_THEME, ATTRIBUTE_STREAMING, ATTRIBUTE_RESPONSE];
  }

  private readonly state = new StateStore();
  private readonly queries = new QueryRegistry();
  private readonly actionRunner: ActionRunner;
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

    this.actionRunner = new ActionRunner({
      getContext: () => this.context,
      onAssistantMessage: (message) => {
        this.dispatchEvent(new CustomEvent("assistant-message", {
          detail: { message },
          bubbles: true,
          composed: true,
        }));
      },
    });

    this.context = createContext(this.state, this.queries);
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      actionRunner: this.actionRunner,
    });

    this.queries.setNotify(() => this.scheduleRender());
    this.state.subscribe(() => this.scheduleRender());
  }

  connectedCallback(): void {
    this.applyThemeFromAttribute();
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

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === ATTRIBUTE_THEME) this.applyThemeFromAttribute();
    if (name === ATTRIBUTE_STREAMING) this.scheduleRender();
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
    });
    this.scheduleRender();
  }

  getSystemPrompt(options?: PromptOptions): string {
    return generatePrompt(this.library, options);
  }

  clear(): void {
    this.currentResponse = "";
    this.queries.reset();
    this.state.rebind([]);
    this.programDirty = true;
    this.parseErrors = [];
    this.errorEl.hidden = true;
    this.rootEl.replaceChildren();
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

  // ----- Internal -----

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
        console.error("[llm-response-ui-lang] root evaluation error", err);
      }
    }

    const rendered = this.renderer.render(rootValue);
    this.rootEl.replaceChildren(rendered);
  }

  private replan(): void {
    this.queries.reset();
    this.context = createContext(this.state, this.queries);
    this.queries.setNotify(() => this.scheduleRender());

    const program = parse(this.currentResponse);
    planProgram(program, this.context);

    this.parseErrors = program.errors.map(
      (e) => `Line ${e.line}: ${e.message}`,
    );
    this.updateErrorBanner();

    if (program.errors.length > 0) {
      this.dispatchEvent(new CustomEvent("error", {
        detail: { errors: program.errors },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private updateErrorBanner(): void {
    if (this.parseErrors.length === 0) {
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

export function defineElement(): void {
  if (!customElements.get(LlmResponseUiLangElement.tagName)) {
    customElements.define(LlmResponseUiLangElement.tagName, LlmResponseUiLangElement);
  }
}
