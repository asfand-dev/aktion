/**
 * Server-side rendering (suggestions-global XI.1).
 *
 * `renderToString(program)` evaluates an Aktion program and returns its HTML
 * plus a state snapshot for client hydration. The renderer is DOM-based, so
 * this runs wherever a DOM is available — the browser, or Node with a DOM shim
 * such as `happy-dom` / `jsdom` installed on `globalThis` (the same setup the
 * test suite uses). Pair the returned `state` with `StateStore.hydrate(...)` /
 * the `<aktion-app>` `hydrate` seam on the client to avoid a flash of empty
 * content.
 *
 *   import { renderToString } from "aktion-runtime";
 *   const { html, state } = renderToString(programSource);
 *   // → embed `html` in the page shell, serialise `state` into a <script>.
 */

import { parse } from "../parser/index.js";
import { StateStore } from "./state.js";
import { createContext, planProgram } from "./evaluator.js";
import { HttpRuntime } from "./http.js";
import { Router } from "./router.js";
import { Renderer } from "../renderer/renderer.js";
import { defaultLibrary } from "../library/index.js";
import type { ComponentLibrary } from "../library/types.js";

export interface RenderToStringOptions {
  /** Component library to render against (defaults to the built-in one). */
  library?: ComponentLibrary;
  /** Initial path for the in-memory router (default "/"). */
  path?: string;
  /** Seed state for SSR — values hydrate over the program's declarations. */
  initialState?: Record<string, unknown>;
  /** Wrap the output in a single container element (default true). */
  container?: boolean;
}

export interface RenderToStringResult {
  /** Serialised HTML for the rendered program. */
  html: string;
  /** State snapshot to ship to the client for hydration. */
  state: Record<string, unknown>;
}

function hasDom(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

/**
 * Render an Aktion program to an HTML string + hydration state.
 *
 * Throws when no DOM is available (install `happy-dom`/`jsdom` and register it
 * on `globalThis` in a Node SSR entry).
 */
export function renderToString(program: string, options: RenderToStringOptions = {}): RenderToStringResult {
  if (!hasDom()) {
    throw new Error(
      "[aktion] renderToString requires a DOM. In Node, register happy-dom or jsdom globals before calling it.",
    );
  }
  const library = options.library ?? defaultLibrary;
  const state = new StateStore();
  if (options.initialState && typeof options.initialState === "object") {
    state.hydrate(options.initialState);
  }
  const router = new Router({ defaultPath: options.path ?? "/" });
  const http = new HttpRuntime();
  const ctx = createContext(state, { library, router, http, notify: () => {} });

  let parsed;
  try {
    parsed = parse(program);
  } catch (err) {
    // A malformed program SSRs to an empty container rather than throwing.
    // eslint-disable-next-line no-console
    console.error("[aktion] renderToString parse error", err);
    return { html: options.container === false ? "" : "<div class=\"rui-root\"></div>", state: state.snapshot() };
  }
  planProgram(parsed, ctx);

  const renderer = new Renderer({
    library,
    state,
    router,
    evaluationContext: () => ctx,
  });

  const appBinding = ctx.bindings.get("aktion");
  let rootValue: unknown = null;
  if (appBinding) {
    try { rootValue = appBinding(); } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] renderToString entry-point error", err);
    }
  }

  renderer.beginRender({ changedPaths: new Set(), memoize: false });
  let node: Node;
  try {
    node = renderer.render(rootValue);
  } finally {
    renderer.endRender();
  }

  const host = document.createElement("div");
  host.className = "rui-root";
  host.append(node);
  const inner = host.innerHTML;
  const html = options.container === false ? inner : host.outerHTML;
  return { html, state: state.snapshot() };
}

/**
 * Like `renderToString` but returns only the markup (no hydration state) —
 * for fully static pages / SSG (suggestions-global XI.1).
 */
export function renderToStaticMarkup(program: string, options: RenderToStringOptions = {}): string {
  return renderToString(program, options).html;
}
