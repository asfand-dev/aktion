/**
 * `<aktion-app>` custom element.
 *
 * Public surface:
 *   - Attributes:
 *       `theme`                  — "light" | "dark" | JSON token map
 *       `streaming`              — "true" while text is still arriving from the LLM
 *       `response`               — Aktion program (string)
 *       `src`                    — URL of an external `.aktion` entry file to
 *                                  fetch + link (resolves its `import` graph)
 *                                  and render, e.g. `src="./app.aktion"`
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
 *       `setUIProvider(provider)`        — replace the built-in library with an interoperability adapter (e.g., MUI, Bootstrap)
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
 *   - Custom events emitted via `emit("name", detail)` inside
 *     `effect` / `action` bodies dispatch with the provided name and detail.
 */

import { parse } from "./parser/index.js";
import type { Program } from "./parser/types.js";
import {
  isCompiledProgram,
  defineCompiledProgram,
  COMPILED_PROGRAM_VERSION,
  type CompiledProgram,
} from "./compiler/runtime.js";
import { linkProject } from "./compiler/project.js";
import { applyDelta, type DeltaOp } from "./tooling/index.js";
import {
  StateStore,
  Router,
  createContext,
  disposeContext,
  planProgram,
  clearInstanceHooks,
  pathsOverlap,
  resetMutableBindings,
  isThemeNode,
  resetRuntimeBudget,
  RuntimeBudgetError,
  type RouteChangeDetail,
} from "./runtime/index.js";
import { HttpRuntime, invalidateQueries, type HttpDevtoolsTap } from "./runtime/http.js";
import { EffectRunner } from "./runtime/effects.js";
import { evaluate, isPureLiteralExpression, type EvaluationContext } from "./runtime/evaluator.js";
import type { ComponentLibrary, ComponentSpec, UIProvider } from "./library/types.js";
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
  builtInThemes,
  clearTokenOverrides,
  resolveTheme,
  sanitiseThemeTokens,
  themeTokenCssVar,
  type ThemeInput,
  type ThemeTokens,
} from "./theme/index.js";
import { loadBuiltInThemeFonts } from "./theme/fonts.js";
import { componentStyles } from "./theme/styles.js";
import { getResponsiveSheet } from "./library/responsive-style.js";
import { ensureFontAwesomeLoaded, registerIcons } from "./icons/index.js";
import {
  devtoolsOption,
  emitDevtoolsEvent,
  getDevtoolsHook,
  isDevtoolsActive,
  nowMs,
  unregisterDevtoolsApp,
  type DevtoolsAppRecord,
} from "./devtools/hook.js";
import type {
  AppStats,
  ComponentRenderRecord,
  Diagnostic,
  EffectEventPayload,
  EffectInfo,
  EvalResult,
  InstanceDetail,
  InstanceNode,
  NetworkRule,
  ProgramAnalysis,
  QueryInfo,
  RouteInfo,
  StateAtomMeta,
  StoreInfo,
  ThemeInfo,
} from "./devtools/protocol.js";
import { bodyPreview, bodySize, toDevtoolsValue, truncate } from "./devtools/serialize.js";
import { findMatchingRule, verdictFor } from "./devtools/rules.js";
import { ancestorsOf, buildInstanceTree, parentKeyOf } from "./devtools/tree.js";
import {
  collectRoutePatterns,
  describeDiagnostics,
  describeHookCells,
  describeQueries,
  describeStateMeta,
  describeStores,
  describeUiState,
  outlineProgram,
} from "./devtools/introspect.js";
import { INSTANCE_ATTR, OWNER_ATTR } from "./renderer/renderer.js";

const ATTRIBUTE_THEME = "theme";
const ATTRIBUTE_STREAMING = "streaming";
const ATTRIBUTE_RESPONSE = "response";
const ATTRIBUTE_SHOW_ERRORS = "showerrors";
const ATTRIBUTE_SRC = "src";
/**
 * Opt-in scroll restoration across route changes (suggestions-global IV.5).
 *   - `"auto"` — save each page's scroll on leave; restore it on back/forward,
 *     scroll to top on a fresh navigation.
 *   - `"top"`  — always scroll to top on every navigation.
 *   - absent   — no scroll management (default; matches prior behaviour).
 */
const ATTRIBUTE_SCROLL_RESTORATION = "scroll-restoration";
/**
 * Text/layout direction (suggestions-global X.1). `"rtl"` flips the rendered
 * tree to right-to-left; `"ltr"` forces left-to-right; `"auto"` defers to the
 * content. Reflected onto the render root so `direction` + CSS logical
 * properties cascade to every component.
 */
const ATTRIBUTE_DIR = "dir";
/**
 * Outer spacing around the rendered app shell. A bare number is treated as
 * pixels (`margin="12"` → `12px`); a full CSS length is passed through
 * (`margin="1rem"`). Reflected onto `.rui-root` as the `--rui-app-margin`
 * custom property, which the stylesheet consumes (default `20px`). Set
 * `margin="0"` to let the app shell touch the edges of its container.
 */
const ATTRIBUTE_MARGIN = "margin";

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
 * use the `route` identifier instead, which is bound to the same
 * underlying state and additionally exposes `navigate(path)`.
 */
const STATE_ROUTE = "route";

/**
 * Build the reactive `route` payload from the router's current state.
 * Returns a plain object with `path`, `params`, `pattern`, `query`, an
 * imperative `navigate(path)` method, plus a `toString()` so template
 * literals like `${route}` coerce to the path.
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
 * Compare two `route` payloads field-by-field. The route store writes a
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

/**
 * Monotonic counter used to mint a stable, human-readable DevTools id per
 * `<aktion-app>` on the page (`aktion-app-1`, `aktion-app-2`, …). The id
 * survives reconnects so the inspector keeps a consistent label.
 */
let devtoolsAppCounter = 0;

/**
 * One transformed-ancestor warning per page load — every `<aktion-app>` on the
 * page shares the same ancestor chain, so repeating it per instance is noise.
 */
let warnedContainingBlock = false;

/**
 * Overlay roots that rely on `position: fixed` resolving against the viewport,
 * i.e. the ones a transformed ancestor breaks (see
 * `detectContainingBlockTrap`). Anchored popups are absent on purpose: they
 * are promoted into the browser top layer by `library/floating.ts`, which is
 * laid out against the viewport whatever the ancestor chain says.
 *
 * This drives a diagnostic only, so drifting behind a renamed class costs a
 * missed warning and nothing else. Mirrors the `position: fixed` rules in
 * `src/theme/styles.ts`.
 */
const FIXED_OVERLAY_SELECTOR = [
  ".rui-modal-overlay", ".rui-sheet-overlay", ".rui-lightbox-overlay",
  ".rui-toasts", ".rui-toast-standalone", ".rui-command-palette-backdrop",
  ".rui-app-shell-scrim", ".rui-tour", ".rui-spotlight", ".rui-spotlight-ring",
  ".rui-fab", ".rui-skip-link", '.rui-backdrop[data-fixed="true"]',
].join(",");

/** `<div class="page" id="root">` → `div.page#root`, for a readable warning. */
function describeElement(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const cls = node.classList.length > 0 ? `.${node.classList[0]}` : "";
  return `${tag}${cls}${id}`;
}

/**
 * Whether `style` makes its element the containing block for `position: fixed`
 * descendants, and if so which declaration does it.
 *
 * Read through `getPropertyValue` so unsupported / vendor-prefixed properties
 * come back as `""` instead of `undefined` in non-browser DOMs.
 */
function containingBlockCause(style: CSSStyleDeclaration): string | null {
  const val = (prop: string): string => (style.getPropertyValue(prop) || "").trim().toLowerCase();
  for (const prop of ["transform", "filter", "backdrop-filter", "-webkit-backdrop-filter", "perspective"]) {
    const v = val(prop);
    if (v && v !== "none") return `${prop}: ${v}`;
  }
  // `contain` only creates one for the layout-affecting keywords.
  const contain = val("contain");
  if (/\b(?:paint|layout|strict|content)\b/.test(contain)) return `contain: ${contain}`;
  // `will-change` creates the containing block up front, before any value is set.
  const willChange = val("will-change");
  if (/\b(?:transform|perspective|filter|backdrop-filter|contain)\b/.test(willChange)) {
    return `will-change: ${willChange}`;
  }
  return null;
}

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
      ATTRIBUTE_SRC,
      ATTRIBUTE_DIR,
      ATTRIBUTE_MARGIN,
    ];
  }

  private readonly state = new StateStore();
  private readonly router = new Router();
  private library: ComponentLibrary = defaultLibrary;
  private currentUIProvider?: UIProvider;
  private readonly http = new HttpRuntime();
  private readonly effectRunner: EffectRunner;
  private renderer: Renderer;
  private context: EvaluationContext;
  private root: ShadowRoot;
  private rootEl: HTMLElement;
  private errorEl: HTMLElement;
  private currentResponse = "";
  /**
   * Pre-parsed AST injected by `mountCompiled(...)` (the multi-file linker
   * path). When set, `replan()` consumes it instead of calling
   * `parse(currentResponse)`, then clears it so a later string update
   * (`setResponse` / `appendChunk`) re-parses normally. `null` for the
   * ordinary streamed-string path.
   */
  private pendingCompiled: Program | null = null;
  /**
   * Module id of the compiled program currently mounted (from
   * `CompiledProgram.path`), or `null` for the string path. Exposed via the
   * `sourceId` getter so HMR / host tooling can target the right instances.
   */
  private compiledSourceId: string | null = null;
  private renderScheduled = false;
  /** True when the program text changed and the runtime needs a re-plan. */
  private programDirty = true;
  /**
   * Set of state paths the most recent render actually read (e.g. `"user.name"`,
   * `"cart"`). The state subscription uses it to gate re-renders: a reactive
   * write only re-renders when its changed path overlaps something the UI
   * read (fine-grained reactivity). `null` means "no baseline yet" — the next
   * change always renders (first paint, post-replan). Explicit `notify()`
   * signals (async/HTTP/timers/effects/hooks) bypass this gate entirely.
   */
  private lastRenderDeps: ReadonlySet<string> | null = null;
  /**
   * Reactive paths changed since the last render, accumulated across flushes
   * (and across gated renders). Drives per-component memoization: the renderer
   * skips a component whose args are unchanged and whose read-paths don't
   * overlap this set.
   */
  private pendingChangedPaths = new Set<string>();
  /**
   * Per-path scroll positions saved for `scroll-restoration="auto"`, so
   * back/forward navigation can return the user to where they were.
   */
  private routeScrollPositions = new Map<string, { x: number; y: number }>();
  /**
   * Set when a re-render was requested via `notify()` (async resolution,
   * timer, HTTP, hook, effect) rather than a tracked `$state` write. The
   * change set isn't fully known in that case, so the next render disables
   * memoization and re-renders everything.
   */
  private forceFullRender = false;
  private parseErrors: string[] = [];
  /**
   * Diagnostics raised while loading a program from the `src` attribute
   * (fetch / link failures, unresolved imports). Tracked separately from
   * `parseErrors` so they survive the `replan()` that mounting the linked
   * program triggers, and are merged into the error banner + `error` event.
   */
  private srcDiagnostics: string[] = [];
  /**
   * Monotonic token guarding overlapping `src` loads. A rapid `src` change
   * (or a reconnect mid-fetch) bumps the token so a stale in-flight load
   * resolves into a no-op instead of clobbering the current program.
   */
  private srcLoadToken = 0;
  /**
   * True once `connectedCallback` has run at least once. Lets
   * `attributeChangedCallback` distinguish the initial attribute upgrade
   * (handled by `connectedCallback`) from a genuine later `src` change.
   */
  private hasConnected = false;
  /**
   * Token keys most recently applied by an in-script `$theme({...})`
   * declaration. We remember them so the next render can clear stale
   * overrides — otherwise switching from a `$theme(...)` block to the
   * base theme would leave the previous tokens stuck on the host.
   */
  private scriptThemeKeys: ReadonlyArray<keyof ThemeTokens> = [];

  /**
   * Strict-mode guard for the "handler-only DOM write" hazard documented in
   * `src/renderer/renderer.ts`: a MutationObserver that queues every attribute
   * an event handler writes on the live DOM, so the next commit can report the
   * ones the reconciler reverted. Armed only when the `strict` attribute is
   * present — always-on it would allocate a record per attribute per commit.
   */
  private morphGuard: MutationObserver | null = null;
  /** Elements → attribute names written since the last commit (strict only). */
  private imperativeAttrWrites: Map<Element, Set<string>> | null = null;
  /** One reverted-write report is a bug report; one per commit is a flood. */
  private warnedMorphRevert = false;
  /**
   * Description of the host-page ancestor that traps `position: fixed` (see
   * {@link detectContainingBlockTrap}), or `null` — the normal case, in which
   * the per-commit overlay check below costs nothing.
   */
  private containingBlockTrap: string | null = null;

  /** Stable DevTools id for this element (`aktion-app-N`). */
  private readonly devtoolsId = `aktion-app-${(devtoolsAppCounter += 1)}`;
  /** Monotonic commit sequence for the render profiler (0 = initial mount). */
  private devtoolsCommitId = 0;
  /** True once this element has been registered with the DevTools hook. */
  private devtoolsRegistered = false;
  /**
   * Component records from the most recent commit. The inspector needs the
   * *current* tree (props, sources, per-instance keys), which is a different
   * question from the profiler's history — and answering it from the last
   * commit means no extra bookkeeping during render.
   */
  private devtoolsComponents: ComponentRenderRecord[] = [];
  /** Structured diagnostics from the last plan, for the Source tab. */
  private devtoolsDiagnostics: Diagnostic[] = [];
  /** Last planned program, kept only for static introspection (routes, outline). */
  private devtoolsProgram: Program | null = null;
  /** DevTools-installed network rules (delay / mock / fail / offline). */
  private devtoolsNetworkRules: NetworkRule[] = [];
  /** Correlation counter for network events. */
  private devtoolsRequestSeq = 0;
  /** In-flight requests, so a terminal event can carry the request details. */
  private readonly devtoolsRequests = new Map<string, { method: string; url: string }>();
  /** True while an HTTP tap is installed on the shared runtime. */
  private devtoolsTapInstalled = false;
  /** Theme tokens DevTools is currently overriding, so they can be cleared. */
  private devtoolsThemeKeys: ReadonlyArray<keyof ThemeTokens> = [];
  /**
   * A navigation waiting for the render that resolves which route arm matched.
   * See {@link handleRouteChange}.
   */
  private devtoolsPendingRoute: { from: string; to: string; source?: string; time: number } | null = null;

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
        // versions where `adoptedStyleSheets` is typed as readonly. The
        // shared dynamic sheet (responsive `sx` atomic rules) is adopted
        // alongside so breakpoint-mapped styles apply inside every root.
        const respSheet = getResponsiveSheet();
        const sheets = respSheet ? [sheet, respSheet] : [sheet];
        (this.root as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = sheets;
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

    this.effectRunner = new EffectRunner({
      state: this.state,
      notify: () => this.requestFullRender(),
      onEmit: (eventName, detail) => this.emitCustomEvent(eventName, detail),
      onEffectEvent: (payload) => this.emitDevtoolsEffect(payload),
    });
    this.context = createContext(this.state, {
      router: this.router,
      library: this.library,
      http: this.http,
      strict: this.hasAttribute("strict"),
      // Names the file a coverage report attributes a single-file / streamed
      // program to. A linked multi-file program carries its own `sources` and
      // ignores this.
      coverageSourcePath: this.compiledSourceId ?? undefined,
      notify: () => this.requestFullRender(),
      onEmit: (eventName, detail) => this.emitCustomEvent(eventName, detail),
    });
    this.renderer = new Renderer({
      library: this.library,
      state: this.state,
      router: this.router,
      onAssistantMessage: dispatchAssistantMessage,
      // Expose the evaluation context so the renderer can expand
      // user-declared `function Foo() { ... }` calls (per-instance
      // state, §7). We pass a getter rather than the live ref because
      // `this.context` is rebuilt on every `replan()`.
      evaluationContext: () => this.context,
      // Per-instance effect lifecycle: the renderer drains effects
      // discovered inside a function body and hands them here so the
      // EffectRunner mounts them with the instance key as prefix.
      // Re-renders are idempotent; `unmountInstanceEffects` fires when
      // the instance disappears from the tree (component-scoped effect
      // teardown, §8 of the side-effects page).
      mountInstanceEffects: (instanceKey, decls, getCtx) =>
        this.effectRunner.syncInstanceEffects(instanceKey, decls, getCtx),
      unmountInstanceEffects: (instanceKey) =>
        this.effectRunner.unmountInstance(instanceKey),
      // Reset a component's `$state` / `$memo` cells when it leaves the tree
      // (React-like reset-on-unmount). The context is rebuilt on replan, so
      // the getter always reaches the live hook store.
      unmountInstanceHooks: (instanceKey) =>
        clearInstanceHooks(this.context, instanceKey),
    });

    this.state.subscribe((changedPaths) => {
      // Accumulate every changed path (even when the gate skips this render)
      // so the NEXT render sees the full change set — that keeps per-component
      // memoization correct across gated renders.
      for (const p of changedPaths) this.pendingChangedPaths.add(p);
      // DevTools: stream every state flush to the inspector — even changes the
      // render-gate skips — so the inspector always mirrors live `$state`.
      if (isDevtoolsActive()) {
        emitDevtoolsEvent({
          kind: "state",
          appId: this.devtoolsId,
          snapshot: this.state.snapshot(),
          changedPaths: [...changedPaths],
          time: nowMs(),
        });
      }
      // Fine-grained render gate: re-render only when a changed reactive path
      // overlaps what the last render actually read. Until a baseline exists
      // (first paint / post-replan) always render. This is the payoff of
      // path-level tracking — writing `$user.role` no longer re-renders a UI
      // that only reads `$user.name`. Explicit `notify()` callbacks (async
      // resolutions, timers, effects, hooks) force a full render instead.
      if (this.lastRenderDeps === null || pathsOverlap(changedPaths, this.lastRenderDeps)) {
        this.scheduleRender();
      }
    });
    this.router.subscribe((detail) => this.handleRouteChange(detail));
  }

  connectedCallback(): void {
    this.hasConnected = true;
    ensureFontAwesomeLoaded(this.root);
    this.containingBlockTrap = this.detectContainingBlockTrap();
    this.registerWithDevtools();
    this.applyThemeFromAttribute();
    this.applyDir();
    this.applyMargin();
    this.startRouter();
    const responseAttr = this.getAttribute(ATTRIBUTE_RESPONSE);
    if (responseAttr !== null && responseAttr !== "" && responseAttr !== this.currentResponse) {
      this.setResponse(responseAttr);
      return;
    }
    // `src` loads an external `.aktion` file (and any modules it imports). It
    // sits below the explicit `response` attribute but above the inner-text
    // fallback, so `<aktion-app src="./app.aktion"></aktion-app>` just works.
    const srcAttr = this.getAttribute(ATTRIBUTE_SRC);
    if (srcAttr && !this.currentResponse) {
      void this.loadFromSrc(srcAttr);
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

  /**
   * Look for an ancestor in the EMBEDDING page that is the containing block for
   * `position: fixed`, and remember what makes it one.
   *
   * A wrapper with `transform` / `filter` / `perspective` / `contain: paint` /
   * `will-change` — a scaled slide deck, an off-canvas nav, a card grid with a
   * hover lift, a page-transition wrapper — makes every fixed overlay inside
   * the shadow root resolve against that wrapper instead of the viewport: the
   * Modal scrim covers only the embed box, Toasts pin to its corner, the FAB
   * floats mid-page. Anchored popups are immune because `floating.ts` promotes
   * them into the browser top layer, which is laid out against the viewport
   * whatever the ancestor chain says; the remaining overlays cannot be rescued
   * from inside the shadow root, because the offending element belongs to the
   * host page and `position: fixed` has no escape hatch. So the only thing left
   * is to name the culprit — otherwise this is indistinguishable from a library
   * bug. Reported by `reportTrappedOverlay` once an affected overlay actually
   * renders, because a transformed wrapper around an app that never opens one is
   * harmless and does not deserve a warning.
   */
  private detectContainingBlockTrap(): string | null {
    if (warnedContainingBlock) return null;
    const view = this.ownerDocument?.defaultView;
    if (!view || typeof view.getComputedStyle !== "function") return null;
    let node: Element | null = this.parentElement;
    // Bounded walk: a pathological DOM must not turn a diagnostic into a stall.
    for (let depth = 0; node && depth < 64; depth += 1, node = node.parentElement) {
      let cause: string | null = null;
      try {
        cause = containingBlockCause(view.getComputedStyle(node));
      } catch {
        return null;
      }
      if (cause) return `<${describeElement(node)}> which sets \`${cause}\``;
    }
    return null;
  }

  /** Name the trap the first time an overlay it breaks reaches the DOM. */
  private reportTrappedOverlay(): void {
    const trap = this.containingBlockTrap;
    if (!trap) return;
    if (warnedContainingBlock) {
      this.containingBlockTrap = null;
      return;
    }
    const overlay = this.rootEl.querySelector(FIXED_OVERLAY_SELECTOR);
    if (!overlay) return;
    warnedContainingBlock = true;
    // Said once; stop querying for the rest of this app's life.
    this.containingBlockTrap = null;
    // eslint-disable-next-line no-console
    console.warn(
      `[aktion] <aktion-app> is inside ${trap}. That element becomes the containing block for ` +
        `\`position: fixed\`, so <${describeElement(overlay)}> (and any other Modal / Sheet / ` +
        "BottomSheet / Toasts / FAB) is positioned against it instead of the viewport — the " +
        "overlay covers only the embed box. Move `<aktion-app>` out of that wrapper, or drop the " +
        "property while an overlay is open. Anchored popups (menus, tooltips, selects) are " +
        "unaffected: they use the browser top layer.",
    );
  }

  /**
   * Arm the strict-mode morph guard (see {@link morphGuard}). Returns whether
   * the guard is running, so the render path can skip the snapshot work
   * entirely in the default (non-strict) case.
   */
  private ensureMorphGuard(): boolean {
    if (this.morphGuard) return true;
    if (!this.hasAttribute("strict") || typeof MutationObserver === "undefined") return false;
    this.imperativeAttrWrites = new Map();
    this.morphGuard = new MutationObserver((records) => this.queueImperativeWrites(records));
    this.morphGuard.observe(this.rootEl, { subtree: true, attributes: true });
    return true;
  }

  private queueImperativeWrites(records: MutationRecord[]): void {
    const seen = this.imperativeAttrWrites;
    // Cap the map: a program that writes attributes in a loop must not turn a
    // diagnostic into a leak. The first few hundred are plenty to find the bug.
    if (!seen || seen.size >= 256) return;
    for (const record of records) {
      const name = record.attributeName;
      if (record.type !== "attributes" || !name || !(record.target instanceof Element)) continue;
      let attrs = seen.get(record.target);
      if (!attrs) {
        attrs = new Set();
        seen.set(record.target, attrs);
      }
      attrs.add(name);
    }
  }

  /**
   * Snapshot every attribute written since the last commit, with the value the
   * writer left behind. Draining the observer at the END of each commit is what
   * keeps the reconciler's own writes out of this set, so what remains here is
   * exactly the imperative writes an event handler (or a post-paint measure)
   * made between two commits.
   */
  private snapshotImperativeWrites(): Array<[Element, string, string | null]> {
    const guard = this.morphGuard;
    const seen = this.imperativeAttrWrites;
    if (!guard || !seen) return [];
    this.queueImperativeWrites(guard.takeRecords());
    const out: Array<[Element, string, string | null]> = [];
    for (const [node, attrs] of seen) {
      if (!node.isConnected) continue;
      for (const attr of attrs) out.push([node, attr, node.getAttribute(attr)]);
    }
    seen.clear();
    return out;
  }

  /**
   * Report the first handler-only DOM write this commit undid. A value that
   * survived the commit is fine — either the render reproduced it (the write
   * was a genuine optimisation over real state) or the attribute is one the
   * reconciler treats as element-owned (a promoted floating panel, a
   * `data-rui-preserve` widget, `<details open>`).
   */
  private checkImperativeWrites(before: ReadonlyArray<[Element, string, string | null]>): void {
    const guard = this.morphGuard;
    if (!guard) return;
    guard.takeRecords();
    this.imperativeAttrWrites?.clear();
    if (this.warnedMorphRevert) return;
    for (const [node, attr, value] of before) {
      // A node the commit removed was not "reverted" — it is simply gone.
      if (!node.isConnected || node.getAttribute(attr) === value) continue;
      this.warnedMorphRevert = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[aktion] strict: this commit reverted \`${attr}\` on <${describeElement(node)}> — it was ` +
          "written straight onto the live DOM by a handler, and the render does not reproduce it, " +
          "so the reconciler removed it again. Back the value with `helpers.setState` (when the " +
          "prop is $-bound) or `helpers.useInstanceState`, and emit the attribute from that value " +
          "during render; keep the direct write as an optimisation only. See the morph contract in " +
          "src/renderer/renderer.ts.",
      );
      return;
    }
  }

  disconnectedCallback(): void {
    this.effectRunner.reset();
    if (this.context) disposeContext(this.context);
    this.morphGuard?.disconnect();
    this.morphGuard = null;
    this.imperativeAttrWrites = null;
    this.router.stop();
    if (this.devtoolsRegistered) {
      unregisterDevtoolsApp(this.devtoolsId);
      this.devtoolsRegistered = false;
    }
    // Drop the network tap and any DevTools-installed request rules: a torn-down
    // element must not keep mocking (or observing) requests the next mount makes.
    if (this.devtoolsTapInstalled) {
      this.http.setDevtoolsTap(null);
      this.devtoolsTapInstalled = false;
      this.devtoolsRequests.clear();
    }
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === ATTRIBUTE_THEME) this.applyThemeFromAttribute();
    if (name === ATTRIBUTE_DIR) this.applyDir();
    if (name === ATTRIBUTE_MARGIN) this.applyMargin();
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
    if (name === ATTRIBUTE_SRC) {
      // Ignore the initial attribute upgrade — `connectedCallback` owns the
      // first load so we don't fetch twice on mount.
      if (this.hasConnected && value) void this.loadFromSrc(value);
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
    // Switching to the string path: drop any compiled artefact + its id so a
    // not-yet-rendered `mountCompiled` can't win.
    this.pendingCompiled = null;
    this.compiledSourceId = null;
    this.programDirty = true;
    this.state.rebind([]);
    // Drop persisted component-local UI state — stale slots from the
    // previous program could otherwise leak into structurally-similar
    // components rendered at the same tree position.
    this.renderer.reset();
    this.parseErrors = [];
    this.srcDiagnostics = [];
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
   * Write one reactive atom, exactly as an `onClick` handler inside the program
   * would.
   *
   * The difference from `hydrateState` is intent, and it is observable.
   * Hydration says "this value came from OUTSIDE the program" — it survives the
   * planner's reset of literal `$state` defaults on a replan, which is what SSR
   * and snapshot restore need. A plain write does not claim that: the atom stays
   * the program's own, so a replan restores its declared default. Use this to
   * drive an app from a host control or a test; use `hydrateState` to restore a
   * snapshot.
   */
  setState(name: string, value: unknown): void {
    this.state.set(name, value as never);
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
    this.pendingCompiled = null;
    this.compiledSourceId = null;
    this.programDirty = true;
    // Clear *defaults* and any leftover values from the previous program
    // before seeding from the snapshot — without this, atoms declared
    // by the previous program would keep their old defaults after the
    // new program plans them with new initial expressions.
    this.state.rebind([]);
    this.renderer.reset();
    this.parseErrors = [];
    this.srcDiagnostics = [];
    // Seed values BEFORE the next render plans the new program. Declare
    // only writes defaults when `has(name) === false`, so the planner
    // will leave our hydrated values intact.
    this.state.hydrate(payload.state);
    this.scheduleRender();
  }

  /**
   * Mount a linked / compiled program — the artefact produced by `linkProject`
   * (multi-file modules) or `compileLite`. The pre-parsed AST is rendered
   * directly, skipping the runtime parser; the runtime still re-validates
   * against the active library on `replan()`, so a host that has called
   * `registerComponents(...)` stays correct even if the program was linked
   * against the default library.
   *
   * The string path (`setResponse`, `appendChunk`, `response`) is unaffected.
   * Pass `state` to seed reactive values before the first render (SSR
   * hydration; preserving live `$state` across a re-mount / hot edit).
   */
  mountCompiled(compiled: CompiledProgram, state?: Record<string, unknown>): void {
    if (!isCompiledProgram(compiled)) {
      // eslint-disable-next-line no-console
      console.error(
        "[aktion] mountCompiled() expected a CompiledProgram (from linkProject() " +
          "or compileLite()); ignoring the call.",
      );
      return;
    }
    // Keep the source so `applyDelta`, `serializeState` round-trips, and a
    // reconnect (which re-parses `currentResponse`) all keep working.
    this.currentResponse = compiled.source;
    this.compiledSourceId = compiled.path;
    // Shallow-clone with a fresh errors array: `replan()` reassigns
    // `program.errors`, and re-mounting the same artefact (e.g. replaying a
    // cached payload) must not accumulate diagnostics on the shared object.
    this.pendingCompiled = { ...compiled.program, errors: [...compiled.program.errors] };
    this.programDirty = true;
    this.state.rebind([]);
    this.renderer.reset();
    this.parseErrors = [];
    // Clear stale src diagnostics. `loadFromSrc` re-seeds them *after* this
    // call returns (mountCompiled only schedules a render), so they still
    // reach the replan microtask for the `src` path.
    this.srcDiagnostics = [];
    // Seed values BEFORE the next render plans the program. `state.declare`
    // only writes defaults for names that don't already exist, so hydrated
    // values survive the replan (same mechanism as `loadSnapshot`).
    if (state) this.state.hydrate(state);
    this.scheduleRender();
  }

  /**
   * Module id of the compiled program currently mounted, or `null` when the
   * element is driven by the streamed-string path.
   */
  get sourceId(): string | null {
    return this.compiledSourceId;
  }

  /** Current `src` attribute value, or `null` when none is set. */
  get src(): string | null {
    return this.getAttribute(ATTRIBUTE_SRC);
  }

  set src(value: string | null) {
    if (value === null) this.removeAttribute(ATTRIBUTE_SRC);
    else this.setAttribute(ATTRIBUTE_SRC, value);
  }

  /**
   * Load the program from an external `.aktion` file referenced by the `src`
   * attribute. The entry is fetched relative to the document, linked through
   * the in-browser project linker (so an entry that `import`s other modules
   * resolves and fetches its whole graph), and mounted as a compiled program.
   *
   * A monotonic token guards against overlapping loads: a rapid `src` change
   * or a reconnect mid-fetch bumps the token, so a stale in-flight load
   * resolves into a no-op instead of clobbering the current program. Fetch /
   * link failures and unresolved imports surface through the same error banner
   * and `error` event as parse errors.
   */
  async loadFromSrc(src: string): Promise<void> {
    const token = (this.srcLoadToken += 1);
    this.srcDiagnostics = [];

    let entryUrl: string;
    try {
      const base = typeof document !== "undefined" ? document.baseURI : undefined;
      entryUrl = new URL(src, base).href;
    } catch {
      this.reportSrcError(`Invalid src "${src}".`);
      return;
    }

    let entryText: string;
    try {
      if (typeof fetch !== "function") throw new Error("global fetch is unavailable");
      const response = await fetch(entryUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      entryText = await response.text();
    } catch (err) {
      if (this.isStaleSrcLoad(token)) return;
      this.reportSrcError(`Failed to load "${src}": ${errorMessage(err)}`);
      return;
    }
    if (this.isStaleSrcLoad(token)) return;

    let result;
    try {
      result = await linkProject({ entry: entryUrl, files: { [entryUrl]: entryText } });
    } catch (err) {
      if (this.isStaleSrcLoad(token)) return;
      this.reportSrcError(`Failed to link "${src}": ${errorMessage(err)}`);
      return;
    }
    if (this.isStaleSrcLoad(token)) return;

    this.mountCompiled(
      defineCompiledProgram({
        __aktionCompiled: COMPILED_PROGRAM_VERSION,
        program: result.program,
        source: result.source,
        path: entryUrl,
      }),
    );
    // `mountCompiled` only *schedules* a render, so seeding the link/fetch
    // diagnostics right after it still lands before the replan microtask
    // runs — the banner + `error` event surface them with any parse errors.
    this.srcDiagnostics = result.diagnostics
      .filter((d) => d.severity !== "warning")
      .map((d) => (d.line > 0 ? `Line ${d.line}: ${d.message}` : d.message));
  }

  /** A `src` load is stale if a newer one started or the element detached. */
  private isStaleSrcLoad(token: number): boolean {
    return token !== this.srcLoadToken || !this.isConnected;
  }

  /**
   * Surface a `src`-loading failure: record it, refresh the banner, and
   * bubble an `error` event so host pages can react (mirrors how parse
   * errors are reported).
   */
  private reportSrcError(message: string): void {
    if (!this.srcDiagnostics.includes(message)) {
      this.srcDiagnostics = [...this.srcDiagnostics, message];
    }
    this.updateErrorBanner();
    this.dispatchEvent(new CustomEvent("error", {
      detail: { errors: [{ line: 0, column: 0, message }] },
      bubbles: true,
      composed: true,
    }));
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
    // reapply any `$theme({...})` from the active program on top of the
    // freshly-painted base.
    this.scriptThemeKeys = [];
    this.scheduleRender();
  }

  /**
   * Completely replaces the built-in component library with an external one (e.g. MUI, Bootstrap).
   * It gives a clear separation of concerns by delegating the UI representation to an implementation package.
   */
  setUIProvider(provider: UIProvider): void {
    if (this.currentUIProvider?.teardown) {
      this.currentUIProvider.teardown();
    }
    
    this.currentUIProvider = provider;
    this.library = provider.library;
    this.renderer.setLibrary(this.library);

    if (provider.setup) {
      provider.setup(this.root);
    }
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
   * Register custom icons (inline SVG markup keyed by name) so authored code
   * can use brand glyphs anywhere a Font Awesome name is accepted. Equivalent
   * to `$theme({ icons: {...} })` from inside a program. Re-renders so any
   * already-rendered icons pick up the new set.
   */
  registerIcons(icons: Record<string, string>): void {
    registerIcons(icons);
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
    this.pendingCompiled = null;
    this.compiledSourceId = null;
    this.state.rebind([]);
    this.effectRunner.reset();
    // Drop component-local UI state (Tabs active pane, Popover open flag,
    // …). Without this, a fresh program would inherit slot values from
    // the previous program and snap stateful primitives into the wrong
    // initial UI.
    this.renderer.reset();
    this.programDirty = true;
    this.parseErrors = [];
    this.srcDiagnostics = [];
    this.errorEl.hidden = true;
    this.errorEl.replaceChildren();
    this.rootEl.replaceChildren();
    // A fresh program gets a fresh strict-mode diagnostic, and the queued
    // writes point at nodes that no longer exist.
    this.morphGuard?.takeRecords();
    this.imperativeAttrWrites?.clear();
    this.warnedMorphRevert = false;
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

  /** Dispatch a custom event from `emit()` calls in effect/action bodies. */
  private emitCustomEvent(eventName: string, detail: unknown): void {
    // Mirror it to DevTools first: a host that stops propagation, or a page
    // with no listener at all, would otherwise make an `emit(...)` that really
    // did fire look like one that never ran.
    if (isDevtoolsActive()) {
      emitDevtoolsEvent({
        kind: "emit",
        appId: this.devtoolsId,
        name: eventName,
        detail: toDevtoolsValue(detail),
        time: nowMs(),
      });
    }
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  /* -------------------------------------------------------------------------- */
  /*  DevTools bridge                                                           */
  /* -------------------------------------------------------------------------- */

  /**
   * Register this element with the global DevTools hook (idempotent). The
   * exposed record only grants a debugger the operations it legitimately
   * needs — read state, push an edit, read the program, force a render —
   * never the raw runtime internals. A no-op when no hook is installed.
   */
  private registerWithDevtools(): void {
    if (this.devtoolsRegistered) return;
    // No hook yet? Stay unregistered and try again later (on the next render,
    // or when a panel explicitly calls `connectDevtools()`). This is the
    // late-attach path: the page opened DevTools *after* the app mounted.
    const hook = getDevtoolsHook();
    if (!hook) return;
    hook.registerApp(this.buildDevtoolsRecord());
    this.devtoolsRegistered = true;
    this.installDevtoolsHttpTap();
  }

  /**
   * Assemble the capability record a frontend drives the app through.
   *
   * Every entry is a narrow, purpose-built operation — read this, write that,
   * navigate there. No raw `context`, `renderer`, or `state` reference escapes,
   * so a buggy (or hostile) frontend cannot reach past what a debugger
   * legitimately needs, and every write it *can* make goes through the same
   * reactive pipeline a real event handler would use.
   */
  private buildDevtoolsRecord(): DevtoolsAppRecord {
    return {
      id: this.devtoolsId,
      label: this.getAttribute("data-devtools-label") || this.id || this.devtoolsId,
      element: this,
      getState: () => this.state.snapshot(),
      setState: (path, value) => this.applyDevtoolsStateEdit(path, value),
      getProgram: () => this.currentResponse,
      forceRender: () => this.requestFullRender(),

      /* ---- program & diagnostics ---- */
      setProgram: (text) => this.setResponse(text),
      getSources: () => this.devtoolsSources(),
      getDiagnostics: () => [...this.devtoolsDiagnostics],
      analyzeProgram: (text) => this.devtoolsAnalyze(text),
      reload: () => {
        this.programDirty = true;
        this.requestFullRender();
      },

      /* ---- inspector ---- */
      getRenderRoot: () => this.rootEl,
      getComponentTree: () => this.devtoolsTree(),
      getInstance: (key) => this.devtoolsInstance(key),
      instanceForNode: (node) => this.devtoolsInstanceForNode(node),
      nodeForInstance: (key) => this.devtoolsNodeForInstance(key),
      setInstanceHook: (key, slot, value) => this.devtoolsSetInstanceHook(key, slot, value),
      setInstanceUiState: (key, slot, value) => {
        const applied = this.renderer.setInstanceUiState(key, slot, value);
        if (applied) this.requestFullRender();
        return applied;
      },
      setPropOverride: (key, prop, value) => {
        this.renderer.setPropOverride(key, prop, value);
        this.requestFullRender();
      },
      clearPropOverride: (key, prop) => {
        this.renderer.clearPropOverride(key, prop);
        this.requestFullRender();
      },
      listPropOverrides: () => this.renderer.listPropOverrides().map((entry) => ({
        instanceKey: entry.instanceKey,
        prop: entry.prop,
        preview: toDevtoolsValue(entry.value).preview,
      })),
      remountInstance: (key) => {
        this.renderer.dropInstance(key);
        clearInstanceHooks(this.context, key);
        this.effectRunner.unmountInstance(key);
        this.requestFullRender();
      },

      /* ---- reactive state ---- */
      getStateMeta: () => this.devtoolsStateMeta(),
      resetState: (names) => {
        if (names && names.length > 0) this.state.reset(...names);
        else this.state.resetAll();
        this.requestFullRender();
      },
      hydrateState: (snapshot) => this.hydrateState(snapshot),
      evaluateExpression: (source) => this.devtoolsEvaluate(source),

      /* ---- effects ---- */
      getEffects: () => this.effectRunner.listMounted() as EffectInfo[],
      runEffect: (key) => this.effectRunner.runNow(key),

      /* ---- data layer ---- */
      getQueries: () => this.devtoolsQueries(),
      refetchQuery: (key) => {
        void this.context.queryCache.get(key)?.refetch();
      },
      cancelQuery: (key) => {
        this.context.queryCache.get(key)?.cancel();
      },
      invalidateQueries: (pattern) => invalidateQueries(this.context, [pattern]),
      getStores: () => this.devtoolsStores(),
      callStoreMethod: (atom, method, args) => this.devtoolsCallStoreMethod(atom, method, args ?? []),

      /* ---- router ---- */
      getRoute: () => this.devtoolsRoute(),
      navigate: (path) => this.router.navigate(path),

      /* ---- theme ---- */
      getTheme: () => this.devtoolsTheme(),
      setThemeTokens: (tokens) => this.devtoolsSetThemeTokens(tokens),
      clearThemeTokens: () => {
        clearTokenOverrides(this, this.devtoolsThemeKeys);
        this.devtoolsThemeKeys = [];
        // Repaint the base theme so cleared tokens fall back correctly, then
        // let the next render re-apply any in-script `$theme({...})`.
        this.applyThemeFromAttribute();
        this.requestFullRender();
      },
      setThemeName: (name) => this.setTheme(name),

      /* ---- network rules ---- */
      setNetworkRules: (rules) => {
        this.devtoolsNetworkRules = rules.map((rule) => ({ ...rule }));
        this.installDevtoolsHttpTap();
      },
      getNetworkRules: () => this.devtoolsNetworkRules.map((rule) => ({ ...rule })),

      /* ---- stats ---- */
      getStats: () => this.devtoolsStats(),
    };
  }

  /* ---- DevTools: program ------------------------------------------------ */

  /**
   * Per-module sources of a linked program, or the single inline source.
   *
   * A multi-file program is planned from a pre-linked AST, so the element only
   * holds the module *paths*; the text of a module it never fetched is not
   * recoverable here. Reporting the paths with empty text would look like empty
   * files, so only the entry text is claimed — the panel labels the rest.
   */
  private devtoolsSources(): Array<{ path: string; text: string }> {
    const paths = this.devtoolsProgram?.sources;
    const entry = this.compiledSourceId ?? "<inline>";
    if (!paths || paths.length === 0) {
      return [{ path: entry, text: this.currentResponse }];
    }
    return paths.map((path, index) => ({
      path,
      text: index === 0 ? this.currentResponse : "",
    }));
  }

  /**
   * Parse + validate a candidate program and outline its declarations, without
   * mounting it.
   *
   * This is what makes the Source tab's editor safe to use: you see the parse
   * errors and the schema violations of the draft *before* replacing a running
   * program. It runs the same parser and the same validator the mount path uses,
   * against the same component library, so its verdict cannot differ.
   */
  private devtoolsAnalyze(text?: string): ProgramAnalysis {
    const source = text ?? this.currentResponse;
    try {
      const program = parse(source);
      const schemaErrors = validateProgramSchema(program, this.library);
      const diagnostics = describeDiagnostics({
        parse: [...program.errors, ...schemaErrors],
        warnings: program.warnings,
      });
      return {
        diagnostics,
        outline: outlineProgram(program.statements),
        ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      };
    } catch (err) {
      return {
        diagnostics: [{ line: 0, column: 0, message: errorMessage(err), kind: "parse", severity: "error" }],
        outline: [],
        ok: false,
      };
    }
  }

  /* ---- DevTools: inspector --------------------------------------------- */

  /** Component tree of the last commit, with liveness resolved against the DOM. */
  private devtoolsTree(): InstanceNode[] {
    const nodes = buildInstanceTree(this.devtoolsComponents);
    for (const node of nodes) {
      node.mounted = this.devtoolsNodeForInstance(node.instanceKey) !== null;
    }
    return nodes;
  }

  /**
   * Everything the inspector knows about one instance: the props it received,
   * its per-instance hook cells, its library UI-state slots, what it reads, the
   * effects it owns, and the DOM it produced.
   *
   * This is the "see and change one component" surface — the props and hooks
   * here are exactly what `setPropOverride` / `setInstanceHook` write back to.
   */
  private devtoolsInstance(instanceKey: string): InstanceDetail | null {
    const record = this.devtoolsComponents.find((c) => c.instanceKey === instanceKey);
    const keys = new Set(this.devtoolsComponents.map((c) => c.instanceKey));
    const node = this.devtoolsNodeForInstance(instanceKey);
    if (!record && !node) return null;

    const overrides = this.renderer.propOverridesFor(instanceKey);
    const effects = this.effectRunner
      .listMounted()
      .filter((effect) => effect.instanceKey === instanceKey)
      .map((effect) => effect.effectKey);

    const detail: InstanceDetail = {
      instanceKey,
      name: record?.name ?? instanceKey.slice(instanceKey.lastIndexOf("#") + 1),
      kind: record?.kind ?? "library",
      parentKey: parentKeyOf(instanceKey, keys),
      depth: record?.depth ?? 0,
      source: record?.source,
      explicitKey: record?.explicitKey,
      props: record?.props ? [...record.props] : [],
      hooks: describeHookCells(this.context.hookStore.get(instanceKey)),
      uiState: describeUiState(this.renderer.listInstanceUiState(instanceKey)),
      deps: record?.deps ? [...record.deps] : [],
      effects,
      ancestors: ancestorsOf(instanceKey, keys),
      mounted: node !== null,
    };
    if (node) {
      detail.html = truncate(node.outerHTML ?? "", 4000);
      detail.domNodes = countDomNodes(node);
    }
    if (overrides && overrides.size > 0) {
      detail.overrides = [...overrides].map(([prop, value]) => ({ prop, value: toDevtoolsValue(value) }));
    }
    return detail;
  }

  /**
   * Resolve a DOM node to the instance that rendered it — the element picker's
   * whole job. Walks up to the nearest tagged ancestor, preferring the library
   * instance (which owns the node) and falling back to the enclosing user
   * component when the node came from a component that renders a fragment.
   */
  private devtoolsInstanceForNode(node: Node): string | null {
    let current: Node | null = node;
    while (current) {
      if (current instanceof Element) {
        const tagged = current.getAttribute(INSTANCE_ATTR) ?? current.getAttribute(OWNER_ATTR);
        if (tagged) return tagged;
      }
      // Cross a shadow boundary rather than stopping at it: the app's own tree
      // lives in a shadow root, and a picker that gave up here would only ever
      // resolve the host element.
      const parent: Node | null = current.parentNode;
      current = parent ?? (current as { host?: Node }).host ?? null;
    }
    return null;
  }

  /** The element an instance rendered, or `null` when it is not in the DOM. */
  private devtoolsNodeForInstance(instanceKey: string): Element | null {
    const escaped = escapeAttrValue(instanceKey);
    const selector = `[${INSTANCE_ATTR}="${escaped}"], [${OWNER_ATTR}="${escaped}"]`;
    try {
      return this.rootEl.querySelector(selector);
    } catch {
      return null;
    }
  }

  /**
   * Write one per-instance hook cell.
   *
   * Hooks are matched by call order, so the slot index is the address. A write
   * lands directly in the cell the next render will read, then forces a render —
   * the same two steps the hook's own setter performs.
   */
  private devtoolsSetInstanceHook(instanceKey: string, slot: number, value: unknown): boolean {
    const cells = this.context.hookStore.get(instanceKey);
    const cell = cells?.[slot];
    if (!cell) return false;
    switch (cell.kind) {
      case "state":
      case "reducer":
        cell.value = value;
        break;
      case "ref":
        cell.box.current = value;
        break;
      default:
        // `memo` recomputes from its deps and `id` is runtime-owned: writing
        // either would be undone (or would break `aria-*` wiring) — refusing is
        // more useful than a change that silently does not stick.
        return false;
    }
    this.requestFullRender();
    return true;
  }

  /* ---- DevTools: state ------------------------------------------------- */

  /** Declaration metadata for every atom (reserved / computed / module). */
  private devtoolsStateMeta(): StateAtomMeta[] {
    const names = Object.keys(this.state.snapshot());
    // A `$x = expr` atom with a non-literal initialiser is DERIVED: the runtime
    // re-evaluates it whenever its dependencies change, so a manual edit lasts
    // only until the next flush. Flagging that prevents a confusing "my edit
    // reverted on its own" — the same predicate the runtime itself uses.
    const computed = new Set<string>();
    const sources = new Map<string, { line: number; column: number }>();
    for (const statement of this.devtoolsProgram?.statements ?? []) {
      if (statement.kind !== "Assignment" || !statement.isState) continue;
      if (statement.loc) {
        sources.set(statement.identifier, { line: statement.loc.line, column: statement.loc.column });
      }
      if (!isPureLiteralExpression(statement.expression)) computed.add(statement.identifier);
    }
    const meta = describeStateMeta(names, computed, this.devtoolsProgram?.sources);
    for (const entry of meta) {
      const loc = sources.get(entry.name) ?? (entry.authored ? sources.get(entry.authored) : undefined);
      if (loc) entry.source = loc;
    }
    return meta;
  }

  /**
   * Evaluate an Aktion expression (or a single `$atom = …` assignment) against
   * the live program scope — the REPL behind the Console tab.
   *
   * Reads see exactly what the program sees: the same bindings, the same
   * per-atom values, the same helpers. Writes go through the normal reactive
   * path, so `$count = 5` from the console is indistinguishable from a button
   * doing it. Evaluation is deliberately NOT tracked as a render dependency:
   * the tracker is swapped out first, so poking at state in the console cannot
   * widen the render gate and change what the app re-renders on.
   */
  private devtoolsEvaluate(source: string): EvalResult {
    const text = source.trim();
    if (text === "") return { ok: false, error: "empty expression" };
    const ctx = this.context;
    const previousTracker = ctx.trackedState;
    ctx.trackedState = new Set<string>();
    try {
      let program = parse(text);
      let statement = program.statements[0];
      // A bare expression (`$count + 1`) is not a top-level statement form, so
      // fall back to wrapping it in an assignment and evaluating the right side.
      if (program.errors.length > 0 || !statement) {
        program = parse(`__aktion_devtools_eval = ${text}`);
        statement = program.statements[0];
        if (program.errors.length > 0 || !statement) {
          return { ok: false, error: program.errors[0]?.message ?? "could not parse expression" };
        }
      }
      if (statement.kind === "Assignment") {
        const value = evaluate(statement.expression, ctx);
        // Only a `$`-prefixed target writes state; `x = 1` on a plain binding
        // would not survive the next render, so it evaluates and reports instead.
        if (statement.isState && statement.identifier !== "__aktion_devtools_eval") {
          this.applyDevtoolsStateEdit(statement.identifier, value);
        }
        return this.devtoolsEvalResult(value);
      }
      if (statement.kind === "ExpressionStatement") {
        return this.devtoolsEvalResult(evaluate(statement.expression, ctx));
      }
      return { ok: false, error: `unsupported statement: ${statement.kind}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      ctx.trackedState = previousTracker;
    }
  }

  private devtoolsEvalResult(value: unknown): EvalResult {
    const described = toDevtoolsValue(value);
    const result: EvalResult = { ok: true, value: described };
    if (described.json !== undefined) result.text = described.json;
    return result;
  }

  /* ---- DevTools: data layer -------------------------------------------- */

  private devtoolsQueries(): QueryInfo[] {
    return describeQueries(this.context.queryCache);
  }

  private devtoolsStores(): StoreInfo[] {
    return describeStores(this.context.stores, (atom) => this.state.get(atom));
  }

  /** Invoke a method on a live `Store` / `$form` handle from the Data tab. */
  private devtoolsCallStoreMethod(atom: string, method: string, args: unknown[]): EvalResult {
    for (const handle of this.context.stores.values()) {
      if (handle.__atom !== atom) continue;
      const fn = handle.__methods?.[method];
      if (typeof fn !== "function") return { ok: false, error: `no method "${method}" on ${atom}` };
      try {
        const value = fn(...args);
        this.requestFullRender();
        return this.devtoolsEvalResult(value);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { ok: false, error: `no store for atom "${atom}"` };
  }

  /* ---- DevTools: router ------------------------------------------------ */

  private devtoolsRoute(): RouteInfo {
    return {
      path: this.router.getPath(),
      pattern: this.router.getActivePattern(),
      params: { ...this.router.getParams() },
      mode: this.router.getMode(),
      basePath: this.getAttribute("router-base") ?? undefined,
      guarded: this.router.hasGuard(),
      declared: this.devtoolsProgram ? collectRoutePatterns(this.devtoolsProgram) : [],
    };
  }

  /* ---- DevTools: theme ------------------------------------------------- */

  private devtoolsTheme(): ThemeInfo {
    const resolved = resolveTheme(this.getAttribute(ATTRIBUTE_THEME));
    const tokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(resolved.tokens)) {
      if (typeof value === "string") tokens[key] = value;
    }
    // Report what is actually painted, not just what the base theme declares:
    // an in-script `$theme({...})` or a DevTools edit writes inline custom
    // properties, and those are what the user sees.
    for (const key of [...this.scriptThemeKeys, ...this.devtoolsThemeKeys]) {
      const cssVar = themeTokenCssVar(String(key));
      const cssValue = cssVar ? this.style.getPropertyValue(cssVar) : "";
      if (cssValue) tokens[key as string] = cssValue.trim();
    }
    return {
      name: resolved.name,
      tokens,
      scriptOverrides: this.scriptThemeKeys.map(String),
      devtoolsOverrides: this.devtoolsThemeKeys.map(String),
      available: Object.keys(builtInThemes).sort(),
    };
  }

  private devtoolsSetThemeTokens(tokens: Record<string, string>): void {
    const applied = applyPartialTheme(this, sanitiseThemeTokens(tokens));
    const merged = new Set<keyof ThemeTokens>([...this.devtoolsThemeKeys, ...applied]);
    this.devtoolsThemeKeys = [...merged];
    this.requestFullRender();
  }

  /* ---- DevTools: stats ------------------------------------------------- */

  private devtoolsStats(): AppStats {
    const stats: AppStats = {
      domNodes: countDomNodes(this.rootEl),
      elements: this.rootEl.querySelectorAll("*").length,
      instances: new Set(this.devtoolsComponents.map((c) => c.instanceKey)).size,
      atoms: Object.keys(this.state.snapshot()).length,
      effects: this.effectRunner.listMounted().length,
      queries: this.context.queryCache.size,
      stores: this.context.stores.size,
      programBytes: this.currentResponse.length,
      commits: this.devtoolsCommitId,
    };
    const heap = (performance as unknown as { memory?: { usedJSHeapSize?: number } } | undefined)?.memory;
    if (heap?.usedJSHeapSize != null) stats.heapBytes = heap.usedJSHeapSize;
    return stats;
  }

  /* ---- DevTools: network tap ------------------------------------------ */

  /**
   * Install (or refresh) the HTTP tap that feeds the Network tab and applies
   * DevTools request rules. Removed again in `disconnectedCallback` so a torn
   * down element never keeps emitting.
   */
  private installDevtoolsHttpTap(): void {
    if (this.devtoolsTapInstalled) return;
    const tap: HttpDevtoolsTap = {
      start: (request) => {
        const id = `${this.devtoolsId}-req-${(this.devtoolsRequestSeq += 1)}`;
        if (!devtoolsOption("captureNetwork")) return id;
        this.devtoolsRequests.set(id, { method: request.method, url: request.url });
        emitDevtoolsEvent({
          kind: "network",
          appId: this.devtoolsId,
          requestId: id,
          phase: "start",
          method: request.method,
          url: request.url,
          time: nowMs(),
          requestHeaders: { ...request.headers },
          requestBody: request.body === undefined ? undefined : bodyPreview(request.body, 2000),
        });
        return id;
      },
      finish: (id, outcome) => {
        const pending = this.devtoolsRequests.get(id);
        this.devtoolsRequests.delete(id);
        if (!devtoolsOption("captureNetwork")) return;
        const method = pending?.method ?? outcome.request.method;
        const url = pending?.url ?? outcome.request.url;
        if (outcome.error !== undefined) {
          emitDevtoolsEvent({
            kind: "network",
            appId: this.devtoolsId,
            requestId: id,
            phase: outcome.rule ? "blocked" : "error",
            method,
            url,
            time: nowMs(),
            duration: outcome.duration,
            error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
            rule: outcome.rule,
            injectedDelay: outcome.injectedDelay,
          });
          return;
        }
        const response = outcome.response;
        emitDevtoolsEvent({
          kind: "network",
          appId: this.devtoolsId,
          requestId: id,
          phase: outcome.mocked ? "mock" : "success",
          method,
          url,
          time: nowMs(),
          duration: outcome.duration,
          status: response?.status,
          responseHeaders: response ? { ...response.headers } : undefined,
          responseBody: bodyPreview(response?.body),
          responseSize: bodySize(response?.body),
          rule: outcome.rule,
          injectedDelay: outcome.injectedDelay,
        });
      },
      gate: (request) => {
        if (this.devtoolsNetworkRules.length === 0) return undefined;
        const rule = findMatchingRule(this.devtoolsNetworkRules, request.method, request.url);
        return rule ? verdictFor(rule) : undefined;
      },
    };
    this.http.setDevtoolsTap(tap);
    this.devtoolsTapInstalled = true;
  }

  /**
   * Emit the held navigation now that the render has resolved which arm matched.
   * A no-op when nothing is pending.
   */
  private flushDevtoolsRoute(): void {
    const pending = this.devtoolsPendingRoute;
    if (!pending) return;
    this.devtoolsPendingRoute = null;
    emitDevtoolsEvent({
      kind: "route",
      appId: this.devtoolsId,
      from: pending.from,
      to: pending.to,
      pattern: this.router.getActivePattern(),
      params: { ...this.router.getParams() },
      source: pending.source,
      time: pending.time,
    });
  }

  /** Report a survivable runtime failure to the DevTools error log. */
  private reportDevtoolsError(phase: string, message: string, subject?: string): void {
    if (!isDevtoolsActive()) return;
    emitDevtoolsEvent({
      kind: "error",
      appId: this.devtoolsId,
      phase,
      message,
      subject,
      time: nowMs(),
    });
  }

  /**
   * Public DevTools entry point: attach to a hook that was installed *after*
   * this element mounted. The in-page panel calls this on every
   * `<aktion-app>` it finds when it opens, so late-attaching DevTools picks up
   * already-running apps. Idempotent; safe to call repeatedly.
   */
  connectDevtools(): void {
    this.registerWithDevtools();
    // Already registered from an earlier panel? Re-register so the record picks
    // up a label the host may have set since, and so a panel that reloaded gets
    // a live handle rather than one closing over a stale render pass.
    if (this.devtoolsRegistered) {
      getDevtoolsHook()?.registerApp(this.buildDevtoolsRecord());
      this.installDevtoolsHttpTap();
      // Push a fresh state snapshot + commit so the just-opened panel has data
      // immediately, even for an idle app that won't re-render on its own.
      this.requestFullRender();
    }
  }

  /**
   * Apply a DevTools-originated edit to a reactive atom. Dotted paths
   * (`user.name`) write through `setPath` so the root is reconstructed
   * immutably and dependents wake; bare names go through `set`. Either way the
   * normal reactive flush → render pipeline runs, so the edit behaves exactly
   * like one an event handler would make.
   */
  private applyDevtoolsStateEdit(path: string, value: unknown): void {
    const dot = path.indexOf(".");
    if (dot < 0) {
      this.state.set(path, value);
      return;
    }
    const root = path.slice(0, dot);
    const rest = path.slice(dot + 1).split(".");
    this.state.setPath(root, rest, value);
  }

  /**
   * Stamp `appId` + `time` onto an effect-runner payload and forward it to the
   * hook. The runner already gated on `isDevtoolsActive()` before calling, so
   * by the time we're here a frontend is listening.
   */
  private emitDevtoolsEffect(payload: EffectEventPayload): void {
    emitDevtoolsEvent({
      kind: "effect",
      appId: this.devtoolsId,
      time: nowMs(),
      ...payload,
    });
  }

  private buildInlineStyle(): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = componentStyles;
    return style;
  }

  /**
   * Start the router so the hash listener is attached and `route` is
   * seeded with the current URL. Idempotent — safe to call from
   * `connectedCallback`.
   */
  private startRouter(): void {
    // Apply the URL strategy from attributes before the router attaches its
    // listeners. `router-mode="history"` opts into clean History-API URLs;
    // `router-base` sets the sub-directory the SPA is served under.
    const mode = this.getAttribute("router-mode");
    const base = this.getAttribute("router-base");
    if (mode || base) {
      this.router.configure({
        mode: mode === "history" ? "history" : mode === "hash" ? "hash" : undefined,
        ...(base !== null ? { basePath: base } : {}),
      });
    }
    this.router.start();
    // Seed `route` immediately so the very first render sees the URL
    // hash (instead of the default "/").
    this.writeRouteState();
  }

  /**
   * Write `route` only when its content actually changed. Avoids
   * triggering a redundant render-after-replan cascade — see
   * `routesEqual` for the structural comparison.
   */
  private writeRouteState(): void {
    const next = buildRouteObject(this.router);
    if (routesEqual(this.state.get(STATE_ROUTE), next)) return;
    this.state.set(STATE_ROUTE, next);
  }

  /**
   * React to any path change: write the new value into the route slot (so
   * `route` reads re-evaluate), schedule a re-render, and bubble a
   * `route-change` event so host pages can sync analytics or sidebars.
   */
  private handleRouteChange(detail: RouteChangeDetail): void {
    this.writeRouteState();
    // Hold the navigation until the render that resolves it. Which route arm
    // matched is decided DURING evaluation, so emitting here would report the
    // previous render's pattern — the one piece of information the tab exists
    // to show. The timestamp is taken now, so the timeline still orders it at
    // the moment the URL changed.
    if (isDevtoolsActive()) {
      this.devtoolsPendingRoute = {
        from: detail.previousPath ?? "",
        to: detail.path,
        source: detail.source,
        time: nowMs(),
      };
    }
    this.dispatchEvent(new CustomEvent("route-change", {
      detail,
      bubbles: true,
      composed: true,
    }));
    this.scheduleRender();
    this.handleScrollRestoration(detail);
  }

  /**
   * Save / restore window scroll across route changes when the
   * `scroll-restoration` attribute opts in (IV.5). The outgoing page's scroll
   * is captured synchronously (the DOM hasn't morphed yet); the target scroll
   * is applied in a `requestAnimationFrame` so the incoming page has laid out.
   */
  private handleScrollRestoration(detail: RouteChangeDetail): void {
    if (typeof window === "undefined") return;
    const mode = (this.getAttribute(ATTRIBUTE_SCROLL_RESTORATION) || "").toLowerCase();
    if (mode !== "auto" && mode !== "top") return;
    // Leave the very first paint to the browser's native restoration.
    if (detail.source === "init") return;

    // Capture where we were on the page we're leaving.
    if (mode === "auto" && detail.previousPath != null) {
      this.routeScrollPositions.set(detail.previousPath, {
        x: window.scrollX || 0,
        y: window.scrollY || 0,
      });
    }

    // Back/forward returns to the saved position; a fresh navigation (or
    // `"top"` mode) starts at the top.
    const isPop = detail.source === "hashchange" || detail.source === "external";
    const saved = mode === "auto" && isPop ? this.routeScrollPositions.get(detail.path) : undefined;
    const target = saved ?? { x: 0, y: 0 };

    const apply = (): void => {
      try { window.scrollTo(target.x, target.y); } catch { /* noop in SSR / jsdom */ }
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
    else apply();
  }

  private applyThemeFromAttribute(): void {
    const attr = this.getAttribute(ATTRIBUTE_THEME);
    // A theme selected by NAME must also pull in the web fonts it needs, or the
    // corporate theme silently renders in system-ui and its whole type
    // ladder is lost. Idempotent: loadFonts de-duplicates by URL.
    loadBuiltInThemeFonts(attr);
    applyTheme(this, resolveTheme(attr));
    // Reapplying the base theme wipes every token CSS variable, so the
    // tracker for in-script overrides has to start fresh — the variables
    // it was tracking just got rewritten by the base layer.
    this.scriptThemeKeys = [];
  }

  /**
   * Reflect the host `dir` attribute onto the render root (X.1). Setting
   * `dir` on `rootEl` makes `direction` + CSS logical properties cascade to
   * every rendered component, so an RTL locale flips the whole tree. An
   * absent / empty attribute clears it so the element inherits page direction.
   */
  private applyDir(): void {
    const value = (this.getAttribute(ATTRIBUTE_DIR) || "").toLowerCase();
    if (value === "rtl" || value === "ltr" || value === "auto") {
      this.rootEl.setAttribute("dir", value);
    } else {
      this.rootEl.removeAttribute("dir");
    }
  }

  /**
   * Reflect the host `margin` attribute onto the render root as the
   * `--rui-app-margin` custom property. A bare number is treated as pixels
   * (`margin="12"` → `12px`); a full CSS length passes through. An absent or
   * malformed value clears the override so the stylesheet default (`20px`)
   * applies; `margin="0"` lets the app shell touch its container's edges.
   */
  private applyMargin(): void {
    const raw = this.getAttribute(ATTRIBUTE_MARGIN);
    if (raw === null) {
      this.rootEl.style.removeProperty("--rui-app-margin");
      return;
    }
    const trimmed = raw.trim();
    let value: string | null = null;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      value = `${trimmed}px`;
    } else if (/^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|vmin|vmax|%)$/.test(trimmed)) {
      value = trimmed;
    }
    if (value === null) {
      this.rootEl.style.removeProperty("--rui-app-margin");
    } else {
      this.rootEl.style.setProperty("--rui-app-margin", value);
    }
  }

  /**
   * Look for the reserved `theme` binding in the active program — set by a
   * bare `$theme({...})` statement or an explicit `theme = $theme({...})`
   * assignment (or any binding returning a `ThemeNode`). If found, write
   * its tokens to the host as CSS custom properties so the in-script
   * declaration layers on top of the attribute / `setTheme()` base. The
   * previous render's keys are cleared first so removing a `$theme(...)`
   * line snaps the renderer back to the underlying theme without a reload.
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

  /**
   * Request a full (non-memoized) re-render. Used for changes the path
   * tracker can't see — async / HTTP resolutions, timers, hook setters,
   * effect bodies, custom events. The whole tree re-evaluates next tick.
   */
  private requestFullRender(): void {
    this.forceFullRender = true;
    this.scheduleRender();
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

    // Reset the runtime safety budget so this render starts with a full
    // allowance. Counters persist across the entire render (component
    // recursion, loop iterations) and trip an early abort when the
    // program is accidentally divergent — a recursive `function Foo()
    // { Foo() }`, a stray `for x of Util.range(0, 1e9)`, etc. Without this
    // every tab tab on the playground while the user is mid-keystroke
    // could otherwise freeze the whole browser.
    if (this.context.budget) resetRuntimeBudget(this.context.budget);

    // Late-attach: if a DevTools hook appeared after this app mounted, register
    // now (cheap no-op once registered). Covers apps that re-render on their
    // own (timers/effects/interaction) after the panel opens.
    if (!this.devtoolsRegistered) this.registerWithDevtools();

    // DevTools render profiler: only collect per-component records while a
    // frontend is actually attached. Decide once per commit so the flag stays
    // consistent across this whole pass, and arm the renderer accordingly.
    const devtoolsActive = isDevtoolsActive();
    this.renderer.setProfiling(devtoolsActive, {
      captureProps: devtoolsOption("captureProps"),
      tagDom: devtoolsOption("tagDom"),
    });
    const commitStart = devtoolsActive ? nowMs() : 0;
    let morphTime = 0;

    // Scope a fresh dependency tracker to this render so we learn exactly
    // which state paths the UI read — that read-set becomes the gate that
    // decides whether a future reactive write needs a re-render. Restored in
    // `finally` so an abort can't leak the tracker into the next pass.
    const renderTracker = new Set<string>();
    const prevTracker = this.context.trackedState;
    this.context.trackedState = renderTracker;
    let renderCompleted = false;
    // Open the render guard: any `$state` write that happens while we evaluate
    // the tree (the "set state during render" anti-pattern — e.g. `$user = {…}`
    // at the top of a function used in render position) updates the value but
    // does NOT schedule a re-render, so it can't loop forever.
    this.state.beginRenderPass();
    try {
      // Apply any in-script `$theme({...})` declaration before render so the
      // tokens are in place when components measure themselves or read CSS
      // custom properties (charts that grab `--rui-chart-1`, etc.).
      this.applyScriptThemeOverrides();

      // Drop the previous render's mutable-binding cache so top-level
      // `let`/`var`/plain variables re-seed from their initialisers this
      // render (keeping derived values reactive) while staying stable
      // within the render (so `.push` / `[...x, y]` mutations behave like
      // ordinary JS module variables instead of leaking across renders).
      resetMutableBindings(this.context);

      // The program's entry point is the reserved `aktion` binding —
      // populated by a `$app(...)` statement (or a legacy `aktion = …`
      // assignment). It resolves to the root node, or an array of nodes the
      // renderer mounts as sibling roots.
      const appBinding = this.context.bindings.get("aktion");
      let rootValue: unknown = null;
      if (appBinding) {
        try {
          rootValue = appBinding();
        } catch (err) {
          if (err instanceof RuntimeBudgetError) {
            this.handleRuntimeBudgetError(err);
            return;
          }
          this.reportDevtoolsError("render", errorMessage(err), "$app entry point");
          // eslint-disable-next-line no-console
          console.error("[aktion] entry point evaluation error", err);
        }
      }

      // Snapshot the accumulated change set for this render and decide whether
      // per-component memoization may apply. Memoization is safe only when the
      // change set is fully known: not on first paint / post-replan (no
      // baseline yet) and not when a `notify()` forced this render (the change
      // isn't a tracked path). In those cases every component re-renders.
      const changedPaths = this.pendingChangedPaths;
      this.pendingChangedPaths = new Set<string>();
      const memoize = !this.forceFullRender && this.lastRenderDeps !== null;
      this.forceFullRender = false;

      // Each tick we re-evaluate the entire tree, but instead of throwing the
      // live DOM away (`replaceChildren`) we hand the freshly-rendered tree
      // to a small reconciler that diffs against the existing DOM. That keeps
      // form inputs, scroll positions, <details>.open, and any other browser-
      // owned state stable across renders — typing into one input no longer
      // resets the active tab three components over. The focus snapshot is
      // still useful as a defensive backstop for the rare case where a node's
      // identity actually changes (different tag, replaced subtree).
      this.renderer.beginRender({ changedPaths, memoize });
      const focusSnapshot = this.captureFocus();
      let rendered: Node;
      try {
        rendered = this.renderer.render(rootValue);
      } catch (err) {
        this.renderer.endRender();
        if (err instanceof RuntimeBudgetError) {
          this.handleRuntimeBudgetError(err);
          return;
        }
        throw err;
      }
      // Strict mode only: remember what handlers wrote on the live DOM since
      // the last commit, then report anything this commit undoes (S1204 — a
      // handler-only write has no source of truth the render can reproduce).
      const guarded = this.ensureMorphGuard();
      const imperativeWrites = guarded ? this.snapshotImperativeWrites() : [];
      // Time the reconciler separately from evaluation: "the commit took 30ms"
      // is not actionable until you know whether the program or the DOM diff
      // spent it.
      const morphStart = devtoolsActive ? nowMs() : 0;
      morphChildren(this.rootEl, rendered);
      if (devtoolsActive) morphTime = nowMs() - morphStart;
      if (guarded) this.checkImperativeWrites(imperativeWrites);
      this.renderer.endRender();
      this.restoreFocus(focusSnapshot);
      renderCompleted = true;
      // No-op unless an ancestor of the host traps `position: fixed`.
      if (this.containingBlockTrap) this.reportTrappedOverlay();

      // DevTools: publish this commit (timing + per-component records) to the
      // render profiler. `changedPaths`/`memoize` are still in scope here.
      if (devtoolsActive) {
        const components = this.renderer.drainProfilerRecords();
        let renderedCount = 0;
        let memoizedCount = 0;
        for (const c of components) {
          if (c.phase === "memo") memoizedCount += 1;
          else renderedCount += 1;
        }
        // The inspector reads the CURRENT tree from here rather than replaying
        // the profiler's history, so a selected component keeps resolving to
        // live props even after the panel has trimmed old commits.
        this.devtoolsComponents = components;
        emitDevtoolsEvent({
          kind: "commit",
          appId: this.devtoolsId,
          commitId: this.devtoolsCommitId,
          startTime: commitStart,
          duration: nowMs() - commitStart,
          changedPaths: [...changedPaths],
          fullRender: !memoize,
          initial: this.devtoolsCommitId === 0,
          components,
          rendered: renderedCount,
          memoized: memoizedCount,
          morphTime,
          domNodes: devtoolsOption("measureDom") ? countDomNodes(this.rootEl) : undefined,
          // Time travel needs a value per commit, not per state flush: a commit
          // is the granularity a user actually recognises ("put it back to how
          // it looked two clicks ago").
          snapshot: devtoolsOption("captureSnapshots") ? this.state.snapshot() : undefined,
        });
        this.devtoolsCommitId += 1;
        this.flushDevtoolsRoute();
      } else {
        // Nobody is listening; drop any held navigation rather than reporting a
        // stale one the next time a frontend attaches.
        this.devtoolsPendingRoute = null;
      }
    } finally {
      this.context.trackedState = prevTracker;
      // A completed render's read-set becomes the new gating baseline. If the
      // render aborted (budget error / throw) we drop the baseline so the
      // next change force-renders rather than being wrongly skipped.
      this.lastRenderDeps = renderCompleted ? renderTracker : null;
      // Close the render guard. If a reactive write was suppressed, surface the
      // anti-pattern once so the author can move state seeding out of render.
      if (this.state.endRenderPass()) this.warnStateWriteDuringRender();
    }
  }

  /** Whether the "state write during render" warning has already fired. */
  private warnedStateWriteDuringRender = false;
  private warnStateWriteDuringRender(): void {
    if (this.warnedStateWriteDuringRender) return;
    this.warnedStateWriteDuringRender = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[aktion] A reactive `$state` write happened during render and was applied " +
        "WITHOUT scheduling a re-render, to prevent an infinite render loop. This " +
        "usually means a `$name = …` assignment is running in render position — e.g. " +
        "`$user = {…}` at the top of a lowercase `function` that's invoked to build " +
        "the UI (`$app(page())`), where the function runs as an action and re-writes " +
        "the atom every render. Seed component-local state with a PascalCase component " +
        "(so `$name = …` becomes a set-once per-instance declaration) or the `$state` " +
        "hook, and only write state from event handlers / effects.",
    );
  }

  /**
   * Surface a runtime-budget abort the same way parse errors are
   * surfaced: append it to `parseErrors`, refresh the error banner,
   * and bubble an `error` event so the host page (or playground) can
   * react. The rendered DOM is intentionally left untouched — the
   * partially-rendered output from a previous tick is more useful to
   * the user than a flash of blank UI.
   */
  private handleRuntimeBudgetError(err: RuntimeBudgetError): void {
    const message = `Runtime aborted (${err.kind}): ${err.message}`;
    if (!this.parseErrors.includes(message)) {
      this.parseErrors = [...this.parseErrors, message];
    }
    this.updateErrorBanner();
    this.reportDevtoolsError("budget", err.message, err.kind);
    if (!this.streaming) {
      this.dispatchEvent(new CustomEvent("error", {
        detail: { errors: [{ line: 0, column: 0, message: err.message }] },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private captureFocus(): FocusSnapshot | null {
    // `activeElement` on a shadow root is a getter, and in some DOM
    // implementations it throws when focus currently lives in a DIFFERENT
    // shadow root on the page — which happens routinely once anything else
    // opens one (the DevTools panel's inline editors do it on every edit).
    // Losing a caret restore is a cosmetic regression; letting the throw
    // escape would abort the whole commit, so this must never propagate.
    let active: HTMLElement | null = null;
    try {
      active = this.root.activeElement as HTMLElement | null;
    } catch {
      return null;
    }
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
    // DevTools prop overrides are keyed by instance path, and a new program can
    // produce the same path for a different component — so they do not survive
    // a replan. The panel reports this: an override you installed is gone once
    // the program changes.
    this.renderer.clearAllPropOverrides();
    // A new program has a brand-new dependency surface — drop the render-gate
    // baseline so the first render of the new program always runs and
    // re-establishes it. Re-arm the render-write warning for the new program.
    this.lastRenderDeps = null;
    this.warnedStateWriteDuringRender = false;
    // Drop any state-store subscribers / cleanup callbacks the previous
    // context attached (computed-state derivations, …) so they don't
    // accumulate across replans.
    if (this.context) disposeContext(this.context);
    this.context = createContext(this.state, {
      router: this.router,
      library: this.library,
      http: this.http,
      strict: this.hasAttribute("strict"),
      // Names the file a coverage report attributes a single-file / streamed
      // program to. A linked multi-file program carries its own `sources` and
      // ignores this.
      coverageSourcePath: this.compiledSourceId ?? undefined,
      notify: () => this.requestFullRender(),
      onEmit: (eventName, detail) => this.emitCustomEvent(eventName, detail),
    });

    // Linked / compiled programs inject their pre-parsed AST here, skipping the
    // parser entirely. The streamed-string path falls back to parse(). Consumed
    // once — `mountCompiled` keeps `currentResponse` in sync so a reconnect /
    // later string update re-parses the same program correctly.
    const program = this.pendingCompiled ?? parse(this.currentResponse);
    this.pendingCompiled = null;
    // Schema validator runs alongside the parser so positional arity
    // overflows, unknown props, enum mismatches, built-in-name collisions,
    // and legacy Theme tokens become errors (mirroring the parser-level
    // migration errors for syntactic legacy forms). The banner surfaces
    // them together so authors see one unified list.
    const schemaErrors = validateProgramSchema(program, this.library);
    if (schemaErrors.length > 0) {
      program.errors = [...program.errors, ...schemaErrors];
    }
    // Reset the budget before planning so the computed-derivation pass
    // (which re-evaluates `$x = expr` initializers) starts with a full
    // iteration allowance.
    if (this.context.budget) resetRuntimeBudget(this.context.budget);
    try {
      planProgram(program, this.context);
    } catch (err) {
      if (err instanceof RuntimeBudgetError) {
        // Surface as a synthetic parse-style error so the banner still
        // describes the problem. Leave the context partially planned —
        // any bindings that did register before the abort are still
        // useful to the user as their program stabilises.
        program.errors = [
          ...program.errors,
          { line: 0, column: 0, message: err.message },
        ];
      } else {
        throw err;
      }
    }

    // Mount top-level `effect(() => { … }, [...deps])` declarations from
    // the program. The runner manages their lifecycle (mount, re-run on
    // state changes, teardown). Component-local effects (declared *inside*
    // a function body) are mounted by the renderer per instance — see the
    // `mountInstanceEffects` hook wired into the Renderer above.
    const effectDecls = [...this.context.effectDecls.values()];
    if (effectDecls.length > 0) {
      this.effectRunner.syncEffects(effectDecls, () => this.context);
    }

    // Seed `route` so user expressions like `route.path == "/about"`
    // resolve even before the first hashchange fires.
    this.writeRouteState();

    this.parseErrors = [
      ...program.errors.map((e) => `Line ${e.line}: ${e.message}`),
      ...this.effectRunner.getErrors(),
    ];
    this.updateErrorBanner();

    // DevTools keeps the STRUCTURED diagnostics (line, column, kind) the banner
    // flattens into strings, plus the planned program itself, so the Source tab
    // can place a marker on the right line and list the declared routes.
    this.devtoolsProgram = program;
    this.devtoolsDiagnostics = describeDiagnostics({
      parse: program.errors,
      warnings: program.warnings,
      effects: this.effectRunner.getErrors(),
      src: this.srcDiagnostics,
    });
    for (const error of program.errors) {
      this.reportDevtoolsError("plan", error.message, `line ${error.line}`);
    }

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
    // The banner is gated by the `showerrors` attribute. While the response
    // is still streaming, the in-flight last line is almost always mid-token
    // and will fail to parse, so we also suppress the banner during streaming
    // even when errors are explicitly enabled. Errors are still dispatched via
    // the `error` event for host apps that want to observe them programmatically.
    // `src` load diagnostics are merged in so a failed external program is
    // reported the same way as an inline parse error.
    const messages = [...this.parseErrors, ...this.srcDiagnostics];
    if (!this.showErrors || this.streaming || messages.length === 0) {
      this.errorEl.hidden = true;
      this.errorEl.replaceChildren();
      return;
    }
    this.errorEl.hidden = false;
    const title = document.createElement("div");
    title.textContent = `${messages.length} parse issue${messages.length === 1 ? "" : "s"} (rendered partial UI):`;
    const list = document.createElement("ul");
    for (const message of messages.slice(0, 5)) {
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
/**
 * Escape a string for use inside a quoted attribute selector
 * (`[data-x="…"]`). `CSS.escape` is the wrong tool here — it escapes for an
 * IDENTIFIER, so it would mangle an instance key's `/`, `#`, and `@` into a
 * selector that matches nothing. Only the quote and the backslash actually
 * need escaping inside a quoted value.
 */
function escapeAttrValue(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

/**
 * Count the nodes in a subtree, including text nodes.
 *
 * Element count alone hides the most common bloat in a generated UI (a table
 * that renders one text node per cell), so the DevTools stats report both.
 * Capped so a pathological tree cannot turn a stats read into a freeze.
 */
function countDomNodes(root: Node, limit = 200_000): number {
  let count = 0;
  const stack: Node[] = [root];
  while (stack.length > 0 && count < limit) {
    const node = stack.pop()!;
    count += 1;
    const children = node.childNodes;
    for (let i = 0; i < children.length; i += 1) stack.push(children[i]!);
  }
  return count;
}

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

/** Best-effort message extraction for a caught `unknown` error. */
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

export function defineElement(): void {
  if (!customElements.get(AktionElement.tagName)) {
    customElements.define(AktionElement.tagName, AktionElement);
  }
}
