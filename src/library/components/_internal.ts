/**
 * Internal DOM helpers shared by primitives (`feedback.ts`) and pattern
 * composites (`patterns.ts`). Not exported from the package barrel — these
 * are implementation details that keep avatar/initials rendering consistent
 * across every component that needs them.
 */

import { el, sanitiseImageSrc } from "../utils.js";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

/** Render an `<rui-avatar>` matching the canonical Avatar primitive. */
export function renderAvatar(src: string, name: string, size: AvatarSize): HTMLElement {
  const root = el("span", { class: "rui-avatar", "data-size": size, role: "img" });
  // Defensive sanitisation — even though browsers do not execute JS from
  // `img.src`, an unsafe scheme should never land on a network-fetched
  // attribute (some hosts copy the value into other sinks).
  const safeSrc = sanitiseImageSrc(src);
  if (safeSrc) {
    const img = el("img", { src: safeSrc, alt: name, loading: "lazy" });
    // Resolve the live image from the event so this handler still works
    // after the morph reconciler copies it onto a kept DOM node.
    // (`onerror`'s first argument is typed `Event | string` because the
    // window-level handler also fires from script errors — but for an
    // `<img>` it's always an Event.)
    img.onerror = (event) => {
      const ev = event as Event;
      const live = (ev.currentTarget ?? ev.target) as Element;
      live.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    };
    root.append(img);
  } else {
    root.append(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
  }
  return root;
}

/** Two-letter initials, falling back to `?` for empty input. */
export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || trimmed.charAt(0).toUpperCase();
}

/**
 * Shared outside-click + Escape dismissal for popovers, dropdowns, comboboxes.
 *
 * Previous implementations leaked listeners in three subtle ways:
 *
 *   1. Re-opening the floater (trigger clicked while still open) installed a
 *      second listener pair without removing the first.
 *   2. Closing via any code path *other than* an outside-click / Escape (e.g.
 *      clicking the trigger again, selecting an item, programmatic close)
 *      left the listeners attached, holding references to detached DOM.
 *   3. The host node being removed from the DOM (LLM produced a new response,
 *      route changed, parent re-rendered) silently kept the listeners on the
 *      shadow root forever.
 *
 * This helper installs listeners exactly once per open, exposes a single
 * `dispose()` so every close path can clean up, and observes the host so we
 * auto-dispose when the floater is unmounted.
 *
 * `key` lets the caller dedupe re-opens — if the same `key` is passed while
 * a previous registration is still live, we dispose it before installing
 * the new one.
 */
export interface DismissHandle {
  dispose: () => void;
}

interface DismissOptions {
  liveRoot: HTMLElement;
  onDismiss: () => void;
  /** Stable per-instance identifier, used to deduplicate re-opens. */
  key?: string;
}

const DISMISS_REGISTRY: WeakMap<HTMLElement, DismissHandle> = new WeakMap();

export function installDismissListeners(opts: DismissOptions): DismissHandle {
  const { liveRoot, onDismiss } = opts;
  const existing = DISMISS_REGISTRY.get(liveRoot);
  if (existing) existing.dispose();

  const host = liveRoot.getRootNode() as Document | ShadowRoot;
  let disposed = false;

  const onOutside = (event: Event): void => {
    const target = event.target as Element | null;
    if (target && liveRoot.contains(target)) return;
    handle.dispose();
    onDismiss();
  };
  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    handle.dispose();
    onDismiss();
  };

  // Auto-dispose when the floater is removed from the DOM so we never keep
  // listeners alive against a detached subtree.
  const ownerDoc = liveRoot.ownerDocument;
  let observer: MutationObserver | null = null;
  if (ownerDoc && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (!liveRoot.isConnected) handle.dispose();
    });
    const observeRoot = liveRoot.getRootNode();
    if (observeRoot instanceof Element || observeRoot instanceof Document || observeRoot instanceof ShadowRoot) {
      observer.observe(observeRoot, { childList: true, subtree: true });
    }
  }

  const handle: DismissHandle = {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("click", onOutside, true);
      host.removeEventListener("keydown", onKey, true);
      observer?.disconnect();
      DISMISS_REGISTRY.delete(liveRoot);
    },
  };

  // Defer attachment so the same click that opened the floater does not
  // immediately trip the close handler.
  setTimeout(() => {
    if (disposed) return;
    host.addEventListener("click", onOutside, true);
    host.addEventListener("keydown", onKey, true);
  }, 0);

  DISMISS_REGISTRY.set(liveRoot, handle);
  return handle;
}

/** Trigger an immediate dispose for a live root if one is registered. */
export function disposeDismissListeners(liveRoot: HTMLElement | null | undefined): void {
  if (!liveRoot) return;
  const existing = DISMISS_REGISTRY.get(liveRoot);
  if (existing) existing.dispose();
}
