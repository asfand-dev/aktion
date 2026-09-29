/**
 * Aktion DevTools — shell interactions: tooltips, pointer drags, page push.
 *
 * Each of these touches something outside the reconciler's tree — the page's
 * `<html>` element, window-level pointer capture, a floating tooltip that must
 * never be torn down by a re-render — so they live here as small imperative
 * controllers instead of inside a view.
 */

/* -------------------------------------------------------------------------- */
/*  Tooltips                                                                   */
/* -------------------------------------------------------------------------- */

const SHOW_DELAY = 480;
const WARM_WINDOW = 400;

/**
 * One tooltip for the whole panel, driven by `data-tip` (+ optional
 * `data-kbd`) attributes. Delegated on the shadow root, so a tooltip survives
 * the element under it being patched, and disappears with it when removed.
 *
 * "Warm" mode: after one tooltip has shown, moving to a neighbouring control
 * shows its tooltip immediately — scanning a toolbar should not cost half a
 * second per icon.
 */
export class TooltipController {
  private el: HTMLElement;
  private target: Element | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastHidden = 0;
  private visible = false;

  constructor(private readonly root: ShadowRoot, layer: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "tooltip");
    this.el.hidden = true;
    layer.appendChild(this.el);
    root.addEventListener("pointerover", this.onOver, true);
    root.addEventListener("pointerout", this.onOut, true);
    root.addEventListener("pointerdown", this.hideNow, true);
    root.addEventListener("keydown", this.hideNow, true);
    root.addEventListener("focusin", this.onFocus, true);
    root.addEventListener("focusout", this.onOut, true);
    root.addEventListener("scroll", this.hideNow, true);
  }

  destroy(): void {
    this.root.removeEventListener("pointerover", this.onOver, true);
    this.root.removeEventListener("pointerout", this.onOut, true);
    this.root.removeEventListener("pointerdown", this.hideNow, true);
    this.root.removeEventListener("keydown", this.hideNow, true);
    this.root.removeEventListener("focusin", this.onFocus, true);
    this.root.removeEventListener("focusout", this.onOut, true);
    this.root.removeEventListener("scroll", this.hideNow, true);
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }

  private readonly onOver = (event: Event): void => {
    const target = (event.target as Element | null)?.closest?.("[data-tip]") ?? null;
    if (target === this.target) return;
    this.schedule(target);
  };

  private readonly onFocus = (event: Event): void => {
    const target = (event.target as Element | null)?.closest?.("[data-tip]") ?? null;
    // Only keyboard focus shows a tooltip; a click focusing a button should not.
    if (target && (target as HTMLElement).matches?.(":focus-visible")) this.schedule(target, 0);
  };

  private readonly onOut = (event: Event): void => {
    const related = (event as PointerEvent).relatedTarget as Element | null;
    if (this.target && related && this.target.contains(related)) return;
    this.schedule(null);
  };

  private readonly hideNow = (): void => {
    this.schedule(null);
  };

  private schedule(target: Element | null, delay?: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.target = target;
    if (!target) {
      if (this.visible) this.lastHidden = Date.now();
      this.visible = false;
      this.el.hidden = true;
      return;
    }
    const warm = Date.now() - this.lastHidden < WARM_WINDOW || this.visible;
    const wait = delay ?? (warm ? 0 : SHOW_DELAY);
    this.timer = setTimeout(() => this.show(target), wait);
  }

  private show(target: Element): void {
    if (!target.isConnected || target !== this.target) return;
    const text = target.getAttribute("data-tip");
    if (!text) return;
    const kbdHint = target.getAttribute("data-kbd");
    this.el.replaceChildren(document.createTextNode(text));
    if (kbdHint) {
      for (const key of kbdHint.split(/\s+/).filter(Boolean)) {
        const k = document.createElement("span");
        k.className = "kbd";
        k.textContent = key;
        this.el.appendChild(k);
      }
    }
    this.el.hidden = false;
    this.visible = true;
    const rect = target.getBoundingClientRect();
    const tip = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + 6;
    if (top + tip.height > vh - 4) top = rect.top - tip.height - 6;
    let left = rect.left + rect.width / 2 - tip.width / 2;
    left = Math.max(6, Math.min(vw - tip.width - 6, left));
    this.el.style.top = `${Math.max(4, top)}px`;
    this.el.style.left = `${left}px`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Pointer drags                                                              */
/* -------------------------------------------------------------------------- */

export interface DragHandlers {
  move(dx: number, dy: number, event: PointerEvent): void;
  end?(dx: number, dy: number, event: PointerEvent, moved: boolean): void;
  /** Movement below this (px) is a click, not a drag. */
  threshold?: number;
}

/**
 * Track a pointer from `pointerdown` until release, on the window (so a drag
 * that leaves the panel keeps working), with the page's text selection and
 * iframes kept out of the way for its duration.
 */
export function trackPointer(start: PointerEvent, handlers: DragHandlers): void {
  const threshold = handlers.threshold ?? 3;
  let moved = false;
  const x0 = start.clientX;
  const y0 = start.clientY;
  const doc = document.documentElement;
  const previousSelect = doc.style.userSelect;
  const move = (event: PointerEvent): void => {
    const dx = event.clientX - x0;
    const dy = event.clientY - y0;
    if (!moved && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (!moved) {
      moved = true;
      doc.style.userSelect = "none";
    }
    handlers.move(dx, dy, event);
  };
  const up = (event: PointerEvent): void => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    doc.style.userSelect = previousSelect;
    handlers.end?.(event.clientX - x0, event.clientY - y0, event, moved);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
}

/* -------------------------------------------------------------------------- */
/*  Page push                                                                  */
/* -------------------------------------------------------------------------- */

type Side = "right" | "left" | "bottom";

/**
 * Make room for a docked panel by padding the page, the way browser DevTools
 * shrink the viewport — so the app stays fully visible beside the panel
 * instead of being covered by it.
 *
 * It writes one inline property on `<html>` and remembers the exact value it
 * replaced, so `release()` puts the page back precisely as it was, including a
 * value the host itself had set.
 */
export class PagePush {
  private side: Side | null = null;
  private saved: { property: string; value: string; priority: string } | null = null;

  apply(side: Side | null, size: number): void {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const property = side === "right" ? "padding-right" : side === "left" ? "padding-left" : side === "bottom" ? "padding-bottom" : null;
    if (side !== this.side) this.release();
    if (!property || size <= 0) return;
    if (!this.saved) {
      this.saved = { property, value: html.style.getPropertyValue(property), priority: html.style.getPropertyPriority(property) };
    }
    this.side = side;
    const base = Number.parseFloat(this.saved.value) || 0;
    html.style.setProperty(property, `${Math.round(base + size)}px`, "important");
    html.setAttribute("data-aktion-devtools-docked", side ?? "");
  }

  release(): void {
    if (typeof document === "undefined" || !this.saved) {
      this.side = null;
      return;
    }
    const html = document.documentElement;
    if (this.saved.value) html.style.setProperty(this.saved.property, this.saved.value, this.saved.priority);
    else html.style.removeProperty(this.saved.property);
    html.removeAttribute("data-aktion-devtools-docked");
    this.saved = null;
    this.side = null;
  }
}
