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
 * - `Show(when, children, fallback?)` — sugar over `if`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString, renderIcon } from "../utils.js";
import { normalisePath } from "../../runtime/router.js";
import { morphChildren } from "../../renderer/morph.js";
import { deferToPaint } from "../floating.js";

const renderChild = (helpers: RenderHelpers, value: unknown): Node => {
  if (value == null) return document.createDocumentFragment();
  return helpers.renderNode(value);
};

/** A small secondary button that inherits the theme's Button styling. */
const actionButton = (label: string, className: string): HTMLButtonElement =>
  el("button", {
    type: "button",
    class: `rui-button ${className}`,
    "data-variant": "secondary",
    "data-size": "sm",
  }, [label]) as HTMLButtonElement;

/**
 * `true` only for values that really are an async resource. `typeof x ===
 * "object"` alone accepted every payload an author might hand us — most
 * damagingly a plain array, whose absent `.data` sent the component down the
 * `empty` branch while the rows sat in state. A resource is recognised by
 * carrying at least one of its status channels.
 */
const isResourceShape = (
  value: unknown,
): value is { state?: string; data?: unknown; error?: unknown; loading?: boolean } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return "state" in obj || "loading" in obj || "error" in obj || "data" in obj;
};

/** `true` when a resolved payload has nothing to show. */
const isEmptyPayload = (value: unknown): boolean =>
  value === undefined || value === null || (Array.isArray(value) && value.length === 0);

/**
 * `Async(resource, loading:, error:, empty:, data:)` — render the
 * appropriate branch based on the resource's `state`. The resource is
 * expected to expose at least `{ state, data, error, loading }`.
 */
export const Async: ComponentSpec = {
  name: "Async",
  description:
    "Render `loading`, `error`, `empty`, or `data` slot based on an `$http({...})` resource's state. " +
    "A value that is not a resource (a plain array or object) is treated as already-resolved data. " +
    "Pass `retry` to add a Retry button to the error branch. State transitions are announced to " +
    "screen readers.",
  props: [
    { name: "resource", type: "any", positional: true, required: true },
    { name: "loading", type: "Node", optional: true },
    { name: "error", type: "Node", optional: true },
    { name: "empty", type: "Node", optional: true },
    { name: "data", type: "Node", optional: true },
    { name: "retry", type: "callable", optional: true, aliases: ["onRetry"], description: "Called when the user presses Retry in the error branch (re-run the request)" },
  ],
  render: (_node, props, helpers) => {
    const resource = props.resource;
    const slots = {
      loading: props.loading,
      error: props.error,
      empty: props.empty,
      data: props.data,
    };
    /**
     * Every branch is wrapped so the transition reaches assistive tech: the
     * short status text is its own live region (announcing the *content* would
     * re-read a 40-row table), while `aria-busy` marks the subtree in flight.
     */
    const branch = (content: unknown, status: string, busy: boolean): Node => {
      const wrapper = el("div", {
        class: "rui-async",
        "data-state": status,
        "aria-busy": busy ? "true" : null,
      });
      wrapper.append(el("span", {
        class: "rui-visually-hidden rui-async-status",
        role: "status",
        "aria-live": "polite",
      }, [statusText(status)]));
      wrapper.append(renderChild(helpers, content));
      return wrapper;
    };
    const errorBranch = (): Node => {
      const wrapper = branch(slots.error ?? null, "error", false);
      if (props.retry != null) {
        const retry = actionButton("Retry", "rui-async-retry");
        retry.onclick = () => { helpers.invoke(props.retry); };
        wrapper.appendChild(retry);
      }
      return wrapper;
    };

    if (!isResourceShape(resource)) {
      // Already-resolved data (or nothing at all) rather than a resource.
      return isEmptyPayload(resource)
        ? branch(slots.empty ?? slots.data ?? null, "empty", false)
        : branch(slots.data ?? slots.empty ?? null, "loaded", false);
    }
    const state = (resource as { state?: string }).state;
    if (state === "loading" || (resource as { loading?: boolean }).loading) {
      return branch(slots.loading ?? null, "loading", true);
    }
    if (state === "error" || (resource as { error?: unknown }).error) {
      return errorBranch();
    }
    const data = (resource as { data?: unknown }).data;
    if (isEmptyPayload(data)) {
      return branch(slots.empty ?? slots.data ?? null, "empty", false);
    }
    return branch(slots.data ?? null, "loaded", false);
  },
};

function statusText(status: string): string {
  if (status === "loading") return "Loading…";
  if (status === "error") return "Could not load the data";
  if (status === "empty") return "No results";
  return "Loaded";
}

/**
 * `Show(when, children, fallback?)` — sugar over `if`. Renders `children`
 * when `when` is truthy; falls back to `fallback` (or nothing) otherwise.
 *
 * `children` is declared BEFORE `fallback` on purpose: the second positional
 * argument fills the first unfilled slot, so with `fallback` first
 * `Show($isAdmin, [Button("Delete all")])` bound the button to the *else*
 * branch and showed it to exactly the users who must not see it.
 */
export const Show: ComponentSpec = {
  name: "Show",
  description: "Conditional renderer. Sugar over `if expr { children } else { fallback }`.",
  props: [
    { name: "when", type: "any", positional: true, required: true },
    { name: "children", aliases: ["child"], type: "Node[]", optional: true },
    { name: "fallback", type: "Node", optional: true },
  ],
  render: (_node, props, helpers) => {
    if (props.when) {
      return renderChild(helpers, props.children ?? null);
    }
    return renderChild(helpers, props.fallback ?? null);
  },
};

/**
 * The portal mount layer: a plain container appended to the app's own root, as
 * a sibling of the rendered tree. Two reasons it must live there rather than in
 * `document.body`: the stylesheet (and every `--rui-*` token, declared on
 * `:host`) is adopted into the shadow root only, so light-DOM content renders
 * completely unstyled; and being a top-level sibling is already enough to
 * escape any clipping / stacking ancestor, which is the point of a portal.
 */
function portalLayer(root: ShadowRoot | Document): Element {
  const existing = root.querySelector(".rui-portal-layer");
  if (existing) return existing;
  const layer = el("div", {
    class: "rui-portal-layer",
    // Inline rather than stylesheet-dependent: the layer has to stack above the
    // app content even if a consumer overrides the sheet.
    style: "position:relative;z-index:var(--rui-z-popover, 1350)",
  });
  (root as ShadowRoot).appendChild(layer);
  return layer;
}

/** Resolve the element a portal should mount into, preferring the app's root. */
function portalMount(anchor: Element, target: string): Element | null {
  const root = anchor.getRootNode();
  const scope = root instanceof ShadowRoot || root instanceof Document ? root : null;
  if (target) {
    // `document.querySelector` cannot see an in-app element — the whole app is
    // in a shadow root — so the app's own root is tried first and the document
    // only as the explicitly-requested escape hatch.
    try {
      const scoped = scope?.querySelector(target);
      if (scoped) return scoped;
      const outer = document.querySelector(target);
      if (outer) return outer;
    } catch {
      /* invalid selector — fall through to the styled default layer */
    }
  }
  return scope ? portalLayer(scope) : null;
}

interface PortalEntry {
  container: HTMLElement;
  dispose: () => void;
}

/**
 * `Portal(target?, children)` — render `children` outside the normal
 * subtree. `target` accepts a CSS selector, resolved against the app's own
 * root first and the document second; with no `target` the children mount in a
 * layer inside the app root, where the theme still applies.
 */
export const Portal: ComponentSpec = {
  name: "Portal",
  description:
    "Render children outside the parent subtree — into a layer at the top of the app root by " +
    "default, or into `target` (a CSS selector, resolved inside the app first, then the document).",
  props: [
    { name: "target", type: "string", optional: true },
    { name: "children", aliases: ["child"], type: "Node[]", positional: true },
  ],
  render: (_node, props, helpers) => {
    const target = asString(props.target);
    // Render an empty placeholder in the original position so morph
    // diffing keeps a stable node identity.
    const anchor = el("span", { class: "rui-portal-anchor", "data-portal": target || "app-root" });

    // The container is created ONCE per instance. Rebuilding it per render put
    // the portalled subtree outside the reconciler entirely: the focused input
    // was destroyed on every keystroke (its own `onChange` re-render removed
    // the container it lived in), and scroll position reset on any unrelated
    // state change.
    const slot = helpers.useInstanceState<PortalEntry | null>("rui-portal", null);
    let entry = slot.get();
    if (!entry) {
      const container = el("div", { class: "rui-portal" });
      entry = {
        container,
        dispose: () => {
          container.remove();
          slot.set(null);
        },
      };
      slot.set(entry);
    }
    const container = entry.container;
    // A STABLE disposer identity matters: `registerDisposer` runs the previous
    // cleanup for the same key when the callback differs, which with a
    // per-render closure would tear the portal down on every re-render.
    helpers.registerDisposer(entry.dispose, "rui-portal-container");

    const fresh = document.createDocumentFragment();
    for (const child of asArray(props.children)) {
      fresh.append(helpers.renderNode(child));
    }
    morphChildren(container, fresh);

    // Mount after paint: the anchor is detached during render, so its root (and
    // therefore the layer to mount into) is only knowable once it is in place.
    // On a re-render the reconciler discards this anchor and keeps the mounted
    // one — the container is already where it belongs.
    deferToPaint(() => {
      if (!anchor.isConnected) return;
      const mount = portalMount(anchor, target);
      if (mount && container.parentNode !== mount) mount.append(container);
    });

    return anchor;
  },
};

/**
 * Replace the current history entry instead of pushing a new one.
 *
 * The Router's public surface only pushes (`navigate`), so the URL is rewritten
 * first and the router is then told to go there: in hash mode its own
 * `location.hash` assignment matches the URL already in place and adds nothing,
 * and in history mode `pushState` is routed through `replaceState` for the
 * duration of the call. Either way the guarded route's entry is overwritten, so
 * Back leaves the app instead of bouncing off the guard forever.
 */
function navigateReplacing(router: RenderHelpers["router"], path: string): void {
  const history = typeof window !== "undefined" ? window.history : undefined;
  if (!history || typeof history.replaceState !== "function") {
    router.navigate(path);
    return;
  }
  if (router.getMode() === "history") {
    const push = history.pushState;
    try {
      history.pushState = ((data: unknown, unused: string, url?: string | URL | null) =>
        history.replaceState(data, unused, url)) as typeof history.pushState;
      router.navigate(path);
    } finally {
      history.pushState = push;
    }
    return;
  }
  try {
    history.replaceState(history.state, "", `#${normalisePath(path)}`);
  } catch {
    /* opaque origin / unsupported — the navigate below still gets there. */
  }
  router.navigate(path);
}

/**
 * `Redirect(path)` — Issued by a route guard component. The runtime
 * recognises the rendered output and redirects the router immediately.
 */
export const Redirect: ComponentSpec = {
  name: "Redirect",
  description:
    "Navigate to `path` and unmount the rest of the subtree. Replaces the current history entry " +
    "by default (guard semantics — Back must not return to the route that redirected); pass " +
    "`replace: false` to push one instead.",
  props: [
    { name: "path", type: "string", positional: true, required: true },
    { name: "replace", type: "boolean", optional: true, description: "Replace the current history entry (default true)" },
  ],
  render: (_node, props, helpers) => {
    const path = asString(props.path);
    const replace = props.replace === undefined ? true : props.replace !== false && props.replace !== "false";
    if (path) {
      try {
        if (replace) navigateReplacing(helpers.router, path);
        else helpers.router.navigate(path);
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
 * if it rejects, the `error` slot renders (or the fallback, when none is
 * given). A synchronous (non-promise) loader value renders immediately.
 *
 * The loader runs **once per instance** — its result is held in per-instance
 * state, and the resolved value triggers a single re-render (the same
 * mechanism `Toast`'s auto-dismiss uses). A disposer cancels the pending
 * resolution if the instance unmounts first, so a late settle never writes to
 * a detached instance. The built-in Retry button (rendered when `retry` is set)
 * resets that state and runs the loader again — chunk-load failures after a
 * deploy are usually transient.
 */
type LazyState =
  | { status: "init" }
  | { status: "pending" }
  | { status: "resolved"; value: unknown }
  | { status: "error"; error: unknown };

export const Lazy: ComponentSpec = {
  name: "Lazy",
  description:
    "Defer rendering until an async `loader` resolves: show `fallback` while " +
    "pending, then render the resolved value (or `children`). If the loader " +
    "rejects, the `error` slot renders and `onError(err)` fires; `retry` adds a " +
    "Retry button that runs the loader again. A synchronous loader value " +
    "renders immediately.",
  props: [
    { name: "loader", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", aliases: ["child"], type: "Node[]", optional: true },
    { name: "error", type: "Node", optional: true, description: "Rendered when the loader rejects (defaults to the fallback)" },
    { name: "onError", type: "callable", optional: true, description: "(err) => … fired once when the loader rejects" },
    { name: "retry", type: "callable", optional: true, description: "Called after the built-in Retry button re-runs the loader" },
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
    const paint = (target: Element, value: unknown): void => {
      target.replaceChildren(renderChild(helpers, value));
    };
    const fallback = (): unknown => props.fallback ?? null;
    const resolvedContent = (value: unknown): unknown => value ?? props.children ?? null;

    /** The error branch: the `error` slot (or the fallback) plus Retry. */
    const paintError = (target: Element): void => {
      const content = document.createDocumentFragment();
      content.append(renderChild(helpers, props.error ?? fallback()));
      if (props.retry != null) {
        const retry = actionButton("Retry", "rui-lazy-retry");
        retry.onclick = (event: Event) => {
          const live = ((event.currentTarget ?? event.target) as HTMLElement | null)
            ?.closest(".rui-lazy") ?? target;
          slot.set({ status: "init" });
          attempt(live);
          helpers.invoke(props.retry);
        };
        content.append(retry);
      }
      target.replaceChildren(content);
    };

    const fail = (target: Element, err: unknown): void => {
      slot.set({ status: "error", error: err });
      helpers.invoke(props.onError, err);
      paintError(target);
    };

    /** Run the loader once against `target` (the LIVE wrapper). */
    const attempt = (target: Element): void => {
      let result: unknown;
      try {
        result = typeof loader === "function" ? (loader as () => unknown)() : loader;
      } catch (err) {
        fail(target, err);
        return;
      }

      if (result && typeof (result as { then?: unknown }).then === "function") {
        slot.set({ status: "pending" });
        paint(target, fallback());
        let cancelled = false;
        helpers.registerDisposer(() => { cancelled = true; }, "rui-lazy-cancel");
        void (result as Promise<unknown>).then(
          (value) => {
            if (cancelled) return;
            slot.set({ status: "resolved", value });
            paint(target, resolvedContent(value));
          },
          (err) => {
            if (cancelled) return;
            fail(target, err);
          },
        );
        return;
      }

      // Synchronous value — record and render immediately.
      slot.set({ status: "resolved", value: result });
      paint(target, resolvedContent(result));
    };

    const state = slot.get();
    if (state.status === "resolved") {
      paint(wrapper, resolvedContent(state.value));
      return wrapper;
    }
    if (state.status === "pending") {
      paint(wrapper, fallback());
      return wrapper;
    }
    if (state.status === "error") {
      // Re-render of an already-failed instance: `onError` fired at the moment
      // of failure and must not fire again.
      paintError(wrapper);
      return wrapper;
    }

    // First render for this instance — run the loader once.
    attempt(wrapper);
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
    "Render a fallback subtree when rendering children fails. Pass a " +
    "`fallback` node (or omit it for a built-in friendly error card, which " +
    "shows a Retry button when `onRetry` is set); `onError(err)` fires with " +
    "the error. Set `showDetails=true` to reveal the message inline (great in " +
    "dev).",
  props: [
    { name: "fallback", type: "Node", optional: true },
    { name: "onError", type: "callable", optional: true },
    { name: "showDetails", type: "boolean", optional: true, description: "Show the error message inline (default false)" },
    { name: "onRetry", type: "callable", optional: true, description: "Called when the user presses Retry on the built-in error card" },
    { name: "children", aliases: ["child"], type: "Node[]", positional: true },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("div", { class: "rui-error-boundary" });
    let caught: unknown = null;
    try {
      for (const child of asArray(props.children)) {
        wrapper.append(helpers.renderNode(child));
      }
      // A library component's render error never reaches this catch: the
      // renderer already swallowed it and substituted
      // `<div class="rui-render-error">[render error in X]</div>`. Without
      // this check the boundary silently published that developer text and
      // neither `fallback` nor `onError` ever ran — for the commonest kind of
      // child. A nested boundary consumes its own marker first, so at most one
      // boundary handles each failure.
      const substituted = wrapper.querySelector(".rui-render-error");
      if (!substituted) return wrapper;
      caught = new Error(substituted.textContent?.trim() || "render error");
    } catch (err) {
      caught = err;
    }

    try { helpers.invoke(props.onError, caught); } catch { /* swallow */ }
    const message = caught instanceof Error ? caught.message : String(caught);
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
      if (props.onRetry != null) {
        const retry = actionButton("Retry", "rui-error-card-retry");
        retry.onclick = () => { helpers.invoke(props.onRetry); };
        card.append(retry);
      }
      errorWrapper.append(card);
    }
    // Surface the error message in a hidden attribute for diagnostics.
    errorWrapper.setAttribute("data-error", message);
    return errorWrapper;
  },
};
