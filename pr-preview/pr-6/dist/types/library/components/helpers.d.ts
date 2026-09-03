import { ComponentSpec } from '../types.js';
/**
 * `Async(resource, loading:, error:, empty:, data:)` — render the
 * appropriate branch based on the resource's `state`. The resource is
 * expected to expose at least `{ state, data, error, loading }`.
 */
export declare const Async: ComponentSpec;
/**
 * `Show(when, children, fallback?)` — sugar over `if`. Renders `children`
 * when `when` is truthy; falls back to `fallback` (or nothing) otherwise.
 *
 * `children` is declared BEFORE `fallback` on purpose: the second positional
 * argument fills the first unfilled slot, so with `fallback` first
 * `Show($isAdmin, [Button("Delete all")])` bound the button to the *else*
 * branch and showed it to exactly the users who must not see it.
 */
export declare const Show: ComponentSpec;
/**
 * `Portal(target?, children)` — render `children` outside the normal
 * subtree. `target` accepts a CSS selector, resolved against the app's own
 * root first and the document second; with no `target` the children mount in a
 * layer inside the app root, where the theme still applies.
 */
export declare const Portal: ComponentSpec;
/**
 * `Redirect(path)` — Issued by a route guard component. The runtime
 * recognises the rendered output and redirects the router immediately.
 */
export declare const Redirect: ComponentSpec;
export declare const Lazy: ComponentSpec;
/**
 * `ErrorBoundary(fallback?, onError?, children)` — catches rendering
 * errors raised by descendants and renders the fallback instead.
 */
export declare const ErrorBoundary: ComponentSpec;
