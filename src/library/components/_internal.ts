/**
 * Internal DOM helpers shared by primitives (`feedback.ts`) and pattern
 * composites (`patterns.ts`). Not exported from the package barrel — these
 * are implementation details that keep avatar/initials rendering consistent
 * across every component that needs them.
 */

import { el, sanitiseImageSrc } from "../utils.js";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

/**
 * The slice of `RenderHelpers` an avatar needs. Declared locally (like
 * `DisposerHelpers` below) so this module stays independent of the public
 * type surface. Required, not optional: a caller without it silently loses
 * the error latch, which is the whole point of the parameter.
 */
export interface InstanceStateHelpers {
  useInstanceState: <T>(key: string, initialValue: T) => { get: () => T; set: (value: T) => void };
}

/** Render an `<rui-avatar>` matching the canonical Avatar primitive. */
export function renderAvatar(
  src: string,
  name: string,
  size: AvatarSize,
  helpers: InstanceStateHelpers,
): HTMLElement {
  // `role="img"` prunes this element's contents from the accessibility tree, so
  // the inner `<img alt>` (or the initials fallback) never reached a screen
  // reader — the avatar was announced as an unnamed graphic. The role has to
  // carry the name itself.
  //
  // A nameless avatar is decorative rather than informative (it sits beside the
  // name it would otherwise repeat), so it is hidden instead of announced as an
  // anonymous "image".
  const trimmed = name.trim();
  const root = el("span", {
    class: "rui-avatar",
    "data-size": size,
    role: trimmed ? "img" : null,
    "aria-label": trimmed || null,
    "aria-hidden": trimmed ? null : "true",
  });
  // Defensive sanitisation — even though browsers do not execute JS from
  // `img.src`, an unsafe scheme should never land on a network-fetched
  // attribute (some hosts copy the value into other sinks).
  const safeSrc = sanitiseImageSrc(src);
  // Remember a broken image *per src*. The handler below swaps the live `<img>`
  // for a `<span>`, and morph replaces a node outright whenever the tag names
  // differ — so without a record the next commit re-emitted the `<img>`, threw
  // the initials away, re-requested the dead URL and flashed the broken-image
  // glyph again, on every render. Latching the failure makes the fresh tree
  // agree with the DOM the handler produced; keying by src re-arms the attempt
  // when the caller points at a different image.
  const errorSlot = safeSrc ? helpers.useInstanceState<boolean>(`avatar-error:${safeSrc}`, false) : null;
  if (safeSrc && !errorSlot?.get()) {
    const img = el("img", { src: safeSrc, alt: name, loading: "lazy" });
    // Resolve the live image from the event so this handler still works
    // after the morph reconciler copies it onto a kept DOM node.
    // (`onerror`'s first argument is typed `Event | string` because the
    // window-level handler also fires from script errors — but for an
    // `<img>` it's always an Event.)
    img.onerror = (event) => {
      errorSlot?.set(true);
      const ev = event as Event;
      const live = (ev.currentTarget ?? ev.target) as Element;
      // The imperative swap is only the first-paint optimisation now: instance
      // state does not schedule a render, so the fallback still has to appear
      // before the next commit re-emits it from the branch above.
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
 * `key` dedupes re-opens across element identities. The morph reconciler
 * discards the previous render's panel, so a re-open usually arrives with a
 * *new* `liveRoot` that the element-keyed registry can never match — which is
 * how a closed-and-reopened floater ended up with a second listener pair on
 * the shared shadow root. When the registration held under `key` is no longer
 * connected it is therefore disposed before the new pair is installed. Two
 * roots that are both still on screen under one `key` are two instances of the
 * same component (the keys callers pass are per-component, not per-instance),
 * so that registration is left alone.
 *
 * Escape is handled topmost-first. Every registration listens on the same
 * shared shadow root, and capture at that root is the only phase that runs
 * before a dialog's own bubble-phase Escape handler — so without a stack one
 * keystroke closed the combobox, the popover around it AND the enclosing
 * dialog. The innermost open floater consumes the keystroke; the next Escape
 * reaches the layer below, which is the contract users expect: one press peels
 * exactly one layer.
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

/** One live registration. `root` is needed to tell a dead floater from a live one. */
interface DismissEntry {
  root: HTMLElement;
  key: string | undefined;
  handle: DismissHandle;
}

const DISMISS_REGISTRY: WeakMap<HTMLElement, DismissHandle> = new WeakMap();
/** Live registrations by caller `key` — see the `key` paragraph above. */
const KEYED_REGISTRY = new Map<string, DismissEntry>();
/** Every open floater, innermost LAST. Escape peels the last one only. */
const OPEN_FLOATERS: DismissEntry[] = [];
/** Escape keystrokes already consumed, so no second layer reacts to one press. */
const HANDLED_ESCAPES = new WeakSet<Event>();

/**
 * The innermost floater still on screen.
 *
 * Registrations whose root was unmounted without going through a close path are
 * reclaimed here: the MutationObserver below only notices on the next DOM
 * mutation, which may never come, and until then a dead floater would swallow
 * Escape for the layer the user can actually see.
 */
function topFloater(): DismissEntry | null {
  for (let i = OPEN_FLOATERS.length - 1; i >= 0; i -= 1) {
    const entry = OPEN_FLOATERS[i]!;
    if (entry.root.isConnected) return entry;
    entry.handle.dispose(); // splices itself out of the stack
  }
  return null;
}

export function installDismissListeners(opts: DismissOptions): DismissHandle {
  const { liveRoot, onDismiss, key } = opts;
  DISMISS_REGISTRY.get(liveRoot)?.dispose();
  // A re-open under a fresh element: the pair registered for the panel morph
  // threw away is still on the shared root, and only `key` can find it.
  const prior = key ? KEYED_REGISTRY.get(key) : undefined;
  if (prior && !prior.root.isConnected) prior.handle.dispose();
  // Reclaim any registration whose root has since been unmounted without going
  // through a close path: the observer below only fires on the next DOM
  // mutation, so until now a floater that re-rendered while open could leave a
  // growing pile of dead listener pairs on the shared root.
  for (const stale of [...OPEN_FLOATERS]) {
    if (!stale.root.isConnected) stale.handle.dispose();
  }

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
    // Topmost-first: only the innermost open floater reacts, and it consumes
    // the keystroke so neither a floater below nor the enclosing dialog's own
    // Escape handler closes on the same press. `stopPropagation` from capture
    // at the shared root is what makes that gate work — the dialog listens in
    // the bubble phase, which capture at the root precedes.
    if (HANDLED_ESCAPES.has(event) || topFloater()?.handle !== handle) return;
    HANDLED_ESCAPES.add(event);
    event.preventDefault();
    event.stopPropagation();
    // Consuming the event also swallows the floater's own Escape handler, which
    // is where focus used to be sent back to the trigger. The panel is hidden
    // by the dismissal, so focus left inside it falls to the document body and
    // a keyboard user loses their place — hand it back here instead. Every
    // floater trigger in the library carries `aria-expanded`.
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const fromInside = path.includes(liveRoot) || liveRoot.contains(event.target as Node | null);
    handle.dispose();
    onDismiss();
    if (fromInside) liveRoot.querySelector<HTMLElement>("[aria-expanded]")?.focus?.();
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
      const idx = OPEN_FLOATERS.indexOf(entry);
      if (idx >= 0) OPEN_FLOATERS.splice(idx, 1);
      if (key && KEYED_REGISTRY.get(key) === entry) KEYED_REGISTRY.delete(key);
    },
  };
  const entry: DismissEntry = { root: liveRoot, key, handle };

  // Escape is armed immediately: the deferral below exists so the click that
  // opened the floater cannot close it again, and a keystroke cannot do that
  // (the capture phase at this root has already passed for the event that ran
  // the opener). Deferring it lost the Escape a keyboard user pressed right
  // after opening — which then closed the surrounding dialog instead.
  host.addEventListener("keydown", onKey, true);
  setTimeout(() => {
    if (disposed) return;
    host.addEventListener("click", onOutside, true);
  }, 0);

  DISMISS_REGISTRY.set(liveRoot, handle);
  if (key) KEYED_REGISTRY.set(key, entry);
  OPEN_FLOATERS.push(entry);
  return handle;
}

/** Trigger an immediate dispose for a live root if one is registered. */
export function disposeDismissListeners(liveRoot: HTMLElement | null | undefined): void {
  if (!liveRoot) return;
  const existing = DISMISS_REGISTRY.get(liveRoot);
  if (existing) existing.dispose();
}

/* ------------------------------------------------------------------------ *
 * Modal dialog a11y (Sheet / BottomSheet / ConfirmDialog — VIII.9, X.3)
 * ------------------------------------------------------------------------ */

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Keyboard handler for state-bound dialogs: Escape closes, Tab cycles within
 * the panel (focus trap). Assign to `root.onkeydown` (a property, so the
 * morph keeps the closure fresh); `close` receives the live origin element.
 */
export function dialogKeydownHandler(
  panelSelector: string,
  close: (origin: HTMLElement) => void,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
    if (!origin) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      close(origin);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = origin.querySelector(panelSelector) as HTMLElement | null;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) { event.preventDefault(); return; }
    const doc = origin.getRootNode() as Document | ShadowRoot;
    const active = doc.activeElement;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
}

interface DisposerHelpers {
  registerDisposer: (cleanup: () => void, key?: string) => void;
}

/**
 * Watch a state-bound dialog's `data-open` attribute on the LIVE node and
 * manage focus: on open, move focus to the panel's first focusable element
 * (remembering what had it); on close, restore it. Installed once per
 * instance — re-render snapshots that the morph discards skip themselves via
 * the `isConnected` check, and the observer is torn down through a keyed
 * disposer when the dialog unmounts.
 */
export function wireDialogFocus(
  root: HTMLElement,
  panelSelector: string,
  helpers: DisposerHelpers,
): void {
  if (typeof MutationObserver === "undefined") return;
  setTimeout(() => {
    if (!root.isConnected) return; // discarded snapshot — the mounted render owns the watcher
    let lastFocus: HTMLElement | null = null;
    const onFlip = (isOpen: boolean): void => {
      const doc = root.getRootNode() as Document | ShadowRoot;
      if (isOpen) {
        lastFocus = (doc.activeElement as HTMLElement | null) ?? null;
        const panel = root.querySelector(panelSelector) as HTMLElement | null;
        if (panel && !panel.contains(doc.activeElement)) {
          (panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panel).focus?.();
        }
      } else {
        lastFocus?.focus?.();
        lastFocus = null;
      }
    };
    let prevOpen = root.getAttribute("data-open") === "true";
    if (prevOpen) onFlip(true);
    const observer = new MutationObserver(() => {
      const nowOpen = root.getAttribute("data-open") === "true";
      if (nowOpen !== prevOpen) { prevOpen = nowOpen; onFlip(nowOpen); }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-open"] });
    helpers.registerDisposer(() => observer.disconnect(), "rui-dialog-focus");
  }, 0);
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
