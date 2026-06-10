/**
 * Aktion 0.5 standard helper components.
 *
 * These are the "frameworky" features that ship as library components
 * rather than language constructs (per spec §24). Keeping them as
 * components keeps the language core small and the runtime tractable.
 *
 * - `Async(resource, loading:, error:, empty:, data:)` — branches on an
 *   `$http({...})` resource state.
 * - `ErrorBoundary(fallback:, onError:, children)` — subtree error catcher.
 * - `Portal(target?, children)` — escape-hatch render to another DOM node.
 * - `Redirect(path)` — navigate then unmount. Recognised by the router.
 * - `Lazy(loader, fallback?)` — defer the children until `loader` resolves.
 * - `Show(when, fallback?, children)` — sugar over `if`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString, renderIcon } from "../utils.js";

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
    "Render `loading`, `error`, `empty`, or `data` slot based on an `$http({...})` resource's state.",
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
      // Keyed disposer: registering the new container's removal disposes the
      // PREVIOUS one first, so a re-render swaps the portalled DOM instead of
      // stacking a duplicate container in the target per render. The final
      // container is removed on unmount.
      helpers.registerDisposer(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
      }, "rui-portal-container");
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
 * `Lazy(loader, fallback?, children?)` — Defer rendering until an async
 * `loader` resolves. `loader` is a function returning a promise (or a promise
 * directly). While the promise is pending, the `fallback` is shown; when it
 * resolves, its value renders (or `children` if the resolved value is null);
 * if it rejects, the fallback stays. A synchronous (non-promise) loader value
 * renders immediately.
 *
 * The loader runs **once per instance** — its result is held in per-instance
 * state, and the resolved value triggers a single re-render (the same
 * mechanism `Toast`'s auto-dismiss uses). A disposer cancels the pending
 * resolution if the instance unmounts first, so a late settle never writes to
 * a detached instance.
 */
type LazyState =
  | { status: "init" }
  | { status: "pending" }
  | { status: "resolved"; value: unknown }
  | { status: "error" };

export const Lazy: ComponentSpec = {
  name: "Lazy",
  description:
    "Defer rendering until an async `loader` resolves: show `fallback` while " +
    "pending, then render the resolved value (or `children`). A synchronous " +
    "loader value renders immediately.",
  props: [
    { name: "loader", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    const loader = props.loader;
    // Per-instance state remembers the settled result across re-renders; the
    // loader therefore runs exactly once per instance. The live promise
    // resolution swaps the wrapper's content imperatively (the same approach
    // `Toast`'s auto-dismiss uses) so it works without a host re-render.
    const slot = helpers.useInstanceState<LazyState>("rui-lazy", { status: "init" });

    // `display: contents` keeps the wrapper out of the layout/box model.
    const wrapper = el("span", { class: "rui-lazy", style: "display: contents;" });
    const paint = (value: unknown): void => {
      wrapper.replaceChildren(renderChild(helpers, value));
    };
    const fallback = (): unknown => props.fallback ?? null;
    const resolvedContent = (value: unknown): unknown => value ?? props.children ?? null;

    const state = slot.get();
    if (state.status === "resolved") {
      paint(resolvedContent(state.value));
      return wrapper;
    }
    if (state.status === "pending" || state.status === "error") {
      paint(fallback());
      return wrapper;
    }

    // First render for this instance — run the loader once.
    let result: unknown;
    try {
      result = typeof loader === "function" ? (loader as () => unknown)() : loader;
    } catch {
      slot.set({ status: "error" });
      paint(fallback());
      return wrapper;
    }

    if (result && typeof (result as { then?: unknown }).then === "function") {
      slot.set({ status: "pending" });
      paint(fallback());
      let cancelled = false;
      helpers.registerDisposer(() => { cancelled = true; }, "rui-lazy-cancel");
      void (result as Promise<unknown>).then(
        (value) => {
          if (cancelled) return;
          slot.set({ status: "resolved", value });
          paint(resolvedContent(value));
        },
        () => {
          if (cancelled) return;
          slot.set({ status: "error" });
          paint(fallback());
        },
      );
      return wrapper;
    }

    // Synchronous value — record and render immediately.
    slot.set({ status: "resolved", value: result });
    paint(resolvedContent(result));
    return wrapper;
  },
};

/**
 * `ErrorBoundary(fallback?, onError?, children)` — catches rendering
 * errors raised by descendants and renders the fallback instead.
 */
export const ErrorBoundary: ComponentSpec = {
  name: "ErrorBoundary",
  description:
    "Render a fallback subtree when rendering children throws. Pass a " +
    "`fallback` node (or omit it for a built-in friendly error card showing " +
    "the message + a Retry button); `onError(err)` fires with the error. Set " +
    "`showDetails=true` to reveal the message inline (great in dev).",
  props: [
    { name: "fallback", type: "Node", optional: true },
    { name: "onError", type: "callable", optional: true },
    { name: "showDetails", type: "boolean", optional: true, description: "Show the error message inline (default false)" },
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
      const message = err instanceof Error ? err.message : String(err);
      const errorWrapper = el("div", { class: "rui-error-boundary rui-error-boundary--fallback" });
      errorWrapper.setAttribute("role", "alert");
      if (props.fallback != null) {
        errorWrapper.append(renderChild(helpers, props.fallback));
      } else {
        // Built-in friendly error card (XIV.4) when no fallback is supplied.
        const card = el("div", { class: "rui-error-card" });
        const icon = renderIcon("triangle-exclamation", { className: "rui-error-card-icon" });
        if (icon) card.append(icon);
        card.append(el("div", { class: "rui-error-card-title" }, ["Something went wrong"]));
        if (props.showDetails === true || props.showDetails === "true") {
          card.append(el("div", { class: "rui-error-card-message" }, [message]));
        }
        errorWrapper.append(card);
      }
      // Surface the error message in a hidden attribute for diagnostics.
      errorWrapper.setAttribute("data-error", message);
      return errorWrapper;
    }
  },
};

