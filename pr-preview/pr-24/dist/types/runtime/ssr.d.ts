import { ComponentLibrary } from '../library/types.js';
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
/**
 * Render an Aktion program to an HTML string + hydration state.
 *
 * Throws when no DOM is available (install `happy-dom`/`jsdom` and register it
 * on `globalThis` in a Node SSR entry).
 */
export declare function renderToString(program: string, options?: RenderToStringOptions): RenderToStringResult;
/**
 * Like `renderToString` but returns only the markup (no hydration state) —
 * for fully static pages / SSG (suggestions-global XI.1).
 */
export declare function renderToStaticMarkup(program: string, options?: RenderToStringOptions): string;
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
export declare function renderToTextTree(program: string, options?: RenderToTextTreeOptions): RenderToTextTreeResult;
