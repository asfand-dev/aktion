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

/**
 * Map a free-text label to a sensible Font Awesome icon. Used by
 * "self-decorating" defaults — e.g. StatCard auto-pick from label,
 * EmptyState auto-pick from title, Banner auto-pick from tone.
 *
 * Returns `null` when no rule matches so callers can fall back to whatever
 * default they prefer.
 */
const ICON_KEYWORD_RULES: Array<{ match: RegExp; icon: string }> = [
  { match: /\b(revenue|sales|sale|income|payment|charges?|invoices?|billing)\b/i, icon: "sack-dollar" },
  { match: /\b(profit|earnings?|margin|roi)\b/i, icon: "chart-line" },
  { match: /\b(customers?|clients?|users?|members?|people|accounts?)\b/i, icon: "users" },
  { match: /\b(visitors?|sessions?|traffic|page-?views?|impressions?)\b/i, icon: "chart-line" },
  { match: /\b(orders?|carts?|purchases?|transactions?)\b/i, icon: "cart-shopping" },
  { match: /\b(products?|inventory|sku|stock|items?)\b/i, icon: "box" },
  { match: /\b(subscriptions?|plans?|tiers?|pricing)\b/i, icon: "credit-card" },
  { match: /\b(emails?|messages?|inbox|threads?|mail)\b/i, icon: "envelope" },
  { match: /\b(notifications?|alerts?|reminders?)\b/i, icon: "bell" },
  { match: /\b(growth|trend|increase|up)\b/i, icon: "arrow-trend-up" },
  { match: /\b(decline|drop|down|decrease|loss)\b/i, icon: "arrow-trend-down" },
  { match: /\b(reports?|analytics|insights?|dashboards?|metrics?|stats?|kpis?)\b/i, icon: "chart-pie" },
  { match: /\b(charts?|graphs?)\b/i, icon: "chart-column" },
  { match: /\b(tasks?|todos?|backlog|kanban|sprint)\b/i, icon: "list-check" },
  { match: /\b(projects?|workspaces?)\b/i, icon: "folder-open" },
  { match: /\b(files?|folders?|documents?|docs?|attachments?)\b/i, icon: "folder-open" },
  { match: /\b(images?|photos?|gallery|albums?)\b/i, icon: "image" },
  { match: /\b(videos?|clips?|recordings?)\b/i, icon: "video" },
  { match: /\b(audio|music|podcasts?|sounds?)\b/i, icon: "music" },
  { match: /\b(calendars?|schedule|events?|meetings?|appointments?)\b/i, icon: "calendar-days" },
  { match: /\b(comments?|replies|feedback|reviews?|ratings?)\b/i, icon: "comments" },
  { match: /\b(settings?|preferences?|config|configuration|options?)\b/i, icon: "gear" },
  { match: /\b(security|privacy|password|locks?|secure)\b/i, icon: "shield-halved" },
  { match: /\b(api|integrations?|webhooks?|connections?)\b/i, icon: "plug" },
  { match: /\b(database|storage|backups?|servers?)\b/i, icon: "database" },
  { match: /\b(speed|performance|latency|response\s?time)\b/i, icon: "gauge-high" },
  { match: /\b(uptime|availability|status|health)\b/i, icon: "heart-pulse" },
  { match: /\b(errors?|bugs?|failures?|exceptions?|incidents?)\b/i, icon: "circle-exclamation" },
  { match: /\b(success|complete|done|approved)\b/i, icon: "circle-check" },
  { match: /\b(warnings?|caution)\b/i, icon: "triangle-exclamation" },
  { match: /\b(search|results?|queries)\b/i, icon: "magnifying-glass" },
  { match: /\b(downloads?|exports?)\b/i, icon: "download" },
  { match: /\b(uploads?|imports?)\b/i, icon: "upload" },
  { match: /\b(time|hours?|duration|elapsed)\b/i, icon: "clock" },
  { match: /\b(locations?|maps?|addresses?|countries?|regions?)\b/i, icon: "location-dot" },
  { match: /\b(stars?|favourites?|favorites?|highlights?)\b/i, icon: "star" },
  { match: /\b(trophy|awards?|achievements?|badges?|gold)\b/i, icon: "trophy" },
  { match: /\b(targets?|goals?|objectives?|quotas?)\b/i, icon: "bullseye" },
  { match: /\b(teams?|departments?|orgs?|organisations?|organizations?)\b/i, icon: "people-group" },
  { match: /\b(tickets?|issues?|bugs?|requests?)\b/i, icon: "ticket" },
  { match: /\b(deploys?|builds?|releases?|versions?)\b/i, icon: "rocket" },
];

export function pickIconForLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  for (const rule of ICON_KEYWORD_RULES) {
    if (rule.match.test(label)) return rule.icon;
  }
  return null;
}

/**
 * Map a tone keyword (`primary`, `success`, `warning`, …) to a sensible
 * default icon, used by Banner / Callout when the LLM omits `icon`.
 */
const TONE_ICONS: Record<string, string> = {
  default: "circle-info",
  info: "circle-info",
  primary: "bolt",
  success: "circle-check",
  warning: "triangle-exclamation",
  danger: "circle-exclamation",
  error: "circle-exclamation",
  neutral: "circle-info",
};

export function pickIconForTone(tone: string | null | undefined): string | null {
  if (!tone) return null;
  return TONE_ICONS[tone.toLowerCase()] ?? null;
}

/**
 * Build a deterministic DiceBear avatar URL for a person name.
 *
 * Used as the fallback when the LLM passes a name but omits `src`.
 * `style` defaults to `initials` which is bulletproof (no network face-art),
 * but callers can pass `shapes`, `avataaars`, etc. for fancier looks.
 */
export function dicebearUrlFor(name: string, style: string = "shapes"): string {
  const seed = name.trim() || "anon";
  const safeStyle = /^[a-z0-9-]+$/i.test(style) ? style : "shapes";
  return `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${encodeURIComponent(seed)}`;
}
