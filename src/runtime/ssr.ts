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
import {
  createContext,
  planProgram,
  getHeadManager,
  evaluateUserComponent,
  enterUserComponent,
  leaveUserComponent,
  isComponentNode,
  isUserComponentNode,
  RuntimeBudgetError,
  type EvaluationContext,
} from "./evaluator.js";
import { HttpRuntime } from "./http.js";
import { Router } from "./router.js";
import { Renderer } from "../renderer/renderer.js";
import { defaultLibrary, validateProgramSchema } from "../library/index.js";
import { findComponent } from "../library/registry.js";
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
  /**
   * Resolved `<head>` markup emitted by every `$head({...})` the program ran
   * during this render (title, meta, Open Graph / Twitter cards, links,
   * JSON-LD). Inject it into the page shell's `<head>` so the SSR page is
   * crawlable + shows social previews. Empty string when no `$head` ran.
   */
  head: string;
  /**
   * `<html>` attributes (e.g. `{ lang, dir }`) contributed via
   * `$head({ htmlAttrs })` — spread onto the `<html>` element of the shell.
   */
  headAttrs: Record<string, string>;
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
    return {
      html: options.container === false ? "" : "<div class=\"rui-root\"></div>",
      state: state.snapshot(),
      head: "",
      headAttrs: {},
    };
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
  // Resolve any `$head({...})` the program emitted during this render so the
  // page shell can inject a crawlable `<head>`.
  const headManager = getHeadManager(ctx);
  const head = headManager.serialize();
  const headAttrs = headManager.htmlAttrs();
  return { html, state: state.snapshot(), head, headAttrs };
}

/**
 * Like `renderToString` but returns only the markup (no hydration state) —
 * for fully static pages / SSG (suggestions-global XI.1).
 */
export function renderToStaticMarkup(program: string, options: RenderToStringOptions = {}): string {
  return renderToString(program, options).html;
}

export interface RenderToTextTreeOptions {
  /** Component library to render against (defaults to the built-in one). */
  library?: ComponentLibrary;
  /** Initial path for the in-memory router (default "/"). */
  path?: string;
  /** Seed state — values hydrate over the program's declarations. */
  initialState?: Record<string, unknown>;
}

export interface RenderToTextTreeResult {
  /** Indented text outline of the rendered component tree. */
  text: string;
  /**
   * Parse, schema, and render diagnostics. Empty when the program parsed,
   * validated, and produced a renderable tree without throwing.
   */
  errors: string[];
  /** `true` when `errors` is empty and the root is a renderable node tree. */
  ok: boolean;
}

/**
 * Render an Aktion program to a plain-text component tree **without a DOM**
 * (issue #9). Unlike `renderToString`, this needs no `happy-dom` / `jsdom`,
 * so `node` can confirm a program actually *renders* — not just parses —
 * out of the box. It parses, schema-validates, evaluates the UI root, and
 * recursively expands user components, surfacing every diagnostic it hits:
 * parse errors, schema violations, a non-renderable root (#7), an entry-point
 * throw, and unknown components.
 *
 *   import { renderToTextTree } from "aktion-runtime";
 *   const { ok, text, errors } = renderToTextTree(programSource);
 *   if (!ok) console.error(errors.join("\n"));
 *
 * The text outline is for human/CI inspection (it shows component names and
 * nesting, not pixel-perfect HTML); `errors` / `ok` are the machine signal.
 */
export function renderToTextTree(program: string, options: RenderToTextTreeOptions = {}): RenderToTextTreeResult {
  const library = options.library ?? defaultLibrary;
  const errors: string[] = [];

  const parsed = parse(program);
  for (const e of parsed.errors) errors.push(`parse ${e.line}:${e.column}: ${e.message}`);
  for (const e of validateProgramSchema(parsed, library)) errors.push(`schema ${e.line}:${e.column}: ${e.message}`);

  const state = new StateStore();
  if (options.initialState && typeof options.initialState === "object") {
    state.hydrate(options.initialState);
  }
  const router = new Router({ defaultPath: options.path ?? "/" });
  const http = new HttpRuntime();
  const ctx = createContext(state, { library, router, http, notify: () => {} });

  try {
    planProgram(parsed, ctx);
  } catch (err) {
    errors.push(`plan: ${describeErr(err)}`);
    return { text: "", errors, ok: false };
  }

  const appBinding = ctx.bindings.get("aktion");
  let rootValue: unknown = null;
  if (!appBinding) {
    errors.push("render: program has no UI root — add `$app(...)` (or `aktion = ...`).");
  } else {
    try {
      rootValue = appBinding();
    } catch (err) {
      errors.push(`render: entry point threw — ${describeErr(err)}`);
    }
  }

  if (appBinding && (rootValue === null || rootValue === undefined)) {
    errors.push("render: the UI root is empty (renders nothing).");
  } else if (isBareValue(rootValue)) {
    errors.push(`render: the UI root is a bare ${typeof rootValue}, not a component tree (root-not-renderable).`);
  }

  const lines: string[] = [];
  try {
    walkTextTree(rootValue, ctx, library, 0, "root", lines, errors);
  } catch (err) {
    errors.push(`render: ${describeErr(err)}`);
  }

  return { text: lines.join("\n"), errors, ok: errors.length === 0 };
}

function isBareValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function describeErr(err: unknown): string {
  if (err instanceof RuntimeBudgetError) return `render budget exceeded (${err.message})`;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Walk an evaluated node tree into an indented text outline (DOM-free). */
function walkTextTree(
  value: unknown,
  ctx: EvaluationContext,
  library: ComponentLibrary,
  depth: number,
  path: string,
  lines: string[],
  errors: string[],
): void {
  if (value === null || value === undefined) return;
  const indent = "  ".repeat(depth);

  if (Array.isArray(value)) {
    value.forEach((item, i) => walkTextTree(item, ctx, library, depth, `${path}/${i}`, lines, errors));
    return;
  }

  if (isUserComponentNode(value)) {
    const name = value.decl.name;
    lines.push(`${indent}<${name}>`);
    enterUserComponent(ctx, name);
    try {
      const evaluated = evaluateUserComponent(value, ctx, path);
      walkTextTree(evaluated.value, ctx, library, depth + 1, `${path}#${name}`, lines, errors);
    } catch (err) {
      errors.push(`render: <${name}> threw — ${describeErr(err)}`);
    } finally {
      leaveUserComponent(ctx);
    }
    return;
  }

  if (isComponentNode(value)) {
    const name = value.name;
    if (!findComponent(library, name) && !ctx.componentDecls.has(name)) {
      errors.push(`render: unknown component <${name}>.`);
    }
    lines.push(`${indent}<${name}>`);
    for (const arg of value.args) {
      // Skip plain props-bag objects — only nodes / arrays / text are children.
      if (arg !== null && typeof arg === "object" && !Array.isArray(arg) && !isComponentNode(arg) && !isUserComponentNode(arg)) {
        continue;
      }
      walkTextTree(arg, ctx, library, depth + 1, path, lines, errors);
    }
    return;
  }

  if (isBareValue(value)) {
    const text = String(value);
    if (text.length > 0) lines.push(`${indent}"${text}"`);
    return;
  }
}
