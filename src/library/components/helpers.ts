/**
 * Aktion 0.5 standard helper components.
 *
 * These are the "frameworky" features that ship as library components
 * rather than language constructs (per spec §24). Keeping them as
 * components keeps the language core small and the runtime tractable.
 *
 * - `Async(resource, loading:, error:, empty:, data:)` — branches on an
 *   `Http({...})` resource state.
 * - `ErrorBoundary(fallback:, onError:, children)` — subtree error catcher.
 * - `Portal(target?, children)` — escape-hatch render to another DOM node.
 * - `Redirect(path)` — navigate then unmount. Recognised by the router.
 * - `Lazy(loader, fallback?)` — defer the children until `loader` resolves.
 * - `Show(when, fallback?, children)` — sugar over `if`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString } from "../utils.js";

const renderChild = (helpers: RenderHelpers, value: unknown): Node => {
  if (value == null) return document.createDocumentFragment();
  return helpers.renderNode(value);
};

const isResourceShape = (
  value: unknown,
): value is { state?: string; data?: unknown; error?: unknown; loading?: boolean } => {
  return Boolean(value && typeof value === "object");
};

/**
 * `Async(resource, loading:, error:, empty:, data:)` — render the
 * appropriate branch based on the resource's `state`. The resource is
 * expected to expose at least `{ state, data, error, loading }`.
 */
export const Async: ComponentSpec = {
  name: "Async",
  description:
    "Render `loading`, `error`, `empty`, or `data` slot based on an `Http({...})` resource's state.",
  props: [
    { name: "resource", type: "any", positional: true, required: true },
    { name: "loading", type: "Node", optional: true },
    { name: "error", type: "Node", optional: true },
    { name: "empty", type: "Node", optional: true },
    { name: "data", type: "Node", optional: true },
  ],
  render: (_node, props, helpers) => {
    const resource = props.resource;
    const slots = {
      loading: props.loading,
      error: props.error,
      empty: props.empty,
      data: props.data,
    };
    if (!isResourceShape(resource)) {
      return renderChild(helpers, slots.empty ?? slots.data ?? null);
    }
    const state = (resource as { state?: string }).state;
    if (state === "loading" || (resource as { loading?: boolean }).loading) {
      return renderChild(helpers, slots.loading ?? null);
    }
    if (state === "error" || (resource as { error?: unknown }).error) {
      return renderChild(helpers, slots.error ?? null);
    }
    const data = (resource as { data?: unknown }).data;
    if (data === undefined || data === null || (Array.isArray(data) && data.length === 0)) {
      return renderChild(helpers, slots.empty ?? slots.data ?? null);
    }
    return renderChild(helpers, slots.data ?? null);
  },
};

/**
 * `Show(when, fallback?, children)` — sugar over `if`. Renders `children`
 * when `when` is truthy; falls back to `fallback` (or nothing) otherwise.
 */
export const Show: ComponentSpec = {
  name: "Show",
  description: "Conditional renderer. Sugar over `if expr { children } else { fallback }`.",
  props: [
    { name: "when", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    if (props.when) {
      return renderChild(helpers, props.children ?? null);
    }
    return renderChild(helpers, props.fallback ?? null);
  },
};

/**
 * `Portal(target?, children)` — render `children` outside the normal
 * subtree. `target` accepts a CSS selector; falls back to `document.body`.
 */
export const Portal: ComponentSpec = {
  name: "Portal",
  description: "Render children outside the parent subtree (e.g. into document.body).",
  props: [
    { name: "target", type: "string", optional: true },
    { name: "children", type: "Node[]", positional: true },
  ],
  render: (_node, props, helpers) => {
    const target = asString(props.target);
    let mount: Element | null = null;
    if (target) {
      try {
        mount = document.querySelector(target);
      } catch {
        mount = null;
      }
    }
    if (!mount) mount = document.body;
    const container = el("div", { class: "rui-portal" });
    for (const child of asArray(props.children)) {
      container.append(helpers.renderNode(child));
    }
    if (mount) {
      mount.append(container);
      // Schedule removal on next render — the renderer owns the lifecycle.
      helpers.registerDisposer(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
      });
    }
    // Render an empty placeholder in the original position so morph
    // diffing keeps a stable node identity.
    return el("span", { class: "rui-portal-anchor", "data-portal": target ?? "body" });
  },
};

/**
 * `Redirect(path)` — Issued by a route guard component. The runtime
 * recognises the rendered output and redirects the router immediately.
 */
export const Redirect: ComponentSpec = {
  name: "Redirect",
  description: "Navigate to `path` and unmount the rest of the subtree.",
  props: [
    { name: "path", type: "string", positional: true, required: true },
  ],
  render: (_node, props, helpers) => {
    const path = asString(props.path);
    if (path) {
      try {
        helpers.router.navigate(path);
      } catch {
        // Router may be unavailable (SSR); fall through to no-op.
      }
    }
    return el("span", { class: "rui-redirect", "data-path": path, hidden: "true" });
  },
};

/**
 * `Lazy(loader, fallback?)` — Defer the children until the `loader`
 * promise resolves. The `loader` can be either a function returning a
 * promise or a promise directly.
 */
export const Lazy: ComponentSpec = {
  name: "Lazy",
  description: "Defer rendering `children` until `loader` resolves.",
  props: [
    { name: "loader", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    // Best-effort static rendering: invoke the loader if it's a function;
    // if it returns a promise, render the fallback. The full streaming
    // resolution belongs to the runtime — see status file §24.
    const loader = props.loader;
    if (typeof loader === "function") {
      try {
        const result = (loader as () => unknown)();
        if (result && typeof (result as { then?: unknown }).then === "function") {
          return renderChild(helpers, props.fallback ?? null);
        }
        return renderChild(helpers, result ?? props.children ?? null);
      } catch {
        return renderChild(helpers, props.fallback ?? null);
      }
    }
    return renderChild(helpers, props.children ?? null);
  },
};

/**
 * `ErrorBoundary(fallback?, onError?, children)` — catches rendering
 * errors raised by descendants and renders the fallback instead.
 */
export const ErrorBoundary: ComponentSpec = {
  name: "ErrorBoundary",
  description: "Render a fallback subtree when rendering children throws.",
  props: [
    { name: "fallback", type: "Node", optional: true },
    { name: "onError", type: "callable", optional: true },
    { name: "children", type: "Node[]", positional: true },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("div", { class: "rui-error-boundary" });
    try {
      for (const child of asArray(props.children)) {
        wrapper.append(helpers.renderNode(child));
      }
      return wrapper;
    } catch (err) {
      try { helpers.invoke(props.onError, err); } catch { /* swallow */ }
      const fallback = renderChild(helpers, props.fallback ?? null);
      const errorWrapper = el("div", { class: "rui-error-boundary rui-error-boundary--fallback" });
      errorWrapper.append(fallback);
      // Surface the error message in a hidden attribute for diagnostics.
      errorWrapper.setAttribute("data-error", err instanceof Error ? err.message : String(err));
      return errorWrapper;
    }
  },
};

